"""Sentinel-X : détection de présence humaine sur la webcam.

Pipeline : webcam 640x480 -> letterbox imgsz -> YOLOv8n ONNX -> NMS -> classe person
-> confirmation sur N trames -> POST /api/v1/alerts (avec cooldown).

En parallèle, un petit serveur HTTP sert le dashboard (port 8081 par défaut) :
  GET /video         flux MJPEG des trames brutes (le dashboard dessine le HUD par-dessus)
  GET /video/status  état de la détection en JSON (boîte, confiance, confirmation, ms, FPS)
"""
import argparse
import datetime as dt
import json
import os
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
import requests

PERSON_CLASS_ID = 0
# Objets COCO qui rendent une présence dangereuse (le modèle les connaît sans réentraînement)
DANGER_CLASSES = {43: "knife", 76: "scissors", 34: "baseball bat"}
# Objets affichés pour information, sans alerte ; un sac laissé seul devient « objet abandonné »
INFO_CLASSES = {67: "cell phone", 24: "backpack", 26: "handbag", 28: "suitcase", 63: "laptop"}
BAG_LABELS = {"backpack", "handbag", "suitcase"}
STREAM_FPS = 15  # le flux du dashboard n'a pas besoin de plus
V4L_DIR = Path("/sys/class/video4linux")


def list_cameras() -> list[tuple[str, str]]:
    """Caméras de capture vues par Linux : [(/dev/videoN, nom)]. Vide hors Linux."""
    cams = []
    if not V4L_DIR.exists():
        return cams
    for node in sorted(V4L_DIR.glob("video*"), key=lambda p: int(p.name[5:])):
        # Chaque webcam crée deux nœuds ; seul index 0 donne des images (l'autre = métadonnées)
        if (node / "index").read_text().strip() == "0":
            cams.append((f"/dev/{node.name}", (node / "name").read_text().strip()))
    return cams


def resolve_source(source: str):
    """'4', '/dev/video4' ou un morceau du nom ('c270') -> argument de cv2.VideoCapture.

    Le nom est plus fiable que le numéro : /dev/videoN change selon l'ordre de branchement.
    """
    if source.isdigit():
        return int(source)
    if source.startswith("/dev/"):
        return source
    for path, name in list_cameras():
        if source.lower() in name.lower():
            print(f"Caméra « {source} » trouvée : {name} ({path})")
            return path
    found = ", ".join(f"{p} ({n})" for p, n in list_cameras()) or "aucune"
    raise RuntimeError(f"Aucune caméra ne contient « {source} » dans son nom. Caméras : {found}")


class LatestFrameCapture:
    """Lit la webcam dans un thread et ne garde que la dernière trame (pas de retard qui s'accumule)."""

    def __init__(self, source, width: int, height: int) -> None:
        self.cap = cv2.VideoCapture(source)
        self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        if not self.cap.isOpened():
            raise RuntimeError(f"Impossible d'ouvrir la webcam {source}")
        self.frame = None
        self.lock = threading.Lock()
        self.running = True
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self) -> None:
        while self.running:
            ok, frame = self.cap.read()
            if ok:
                with self.lock:
                    self.frame = frame

    def read(self):
        with self.lock:
            return None if self.frame is None else self.frame.copy()

    def release(self) -> None:
        self.running = False
        self.cap.release()


def letterbox(img: np.ndarray, size: int):
    """Redimensionne en gardant le ratio et complète en gris jusqu'à size x size."""
    h, w = img.shape[:2]
    scale = size / max(h, w)
    nh, nw = round(h * scale), round(w * scale)
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    pad_y, pad_x = (size - nh) // 2, (size - nw) // 2
    canvas = np.full((size, size, 3), 114, dtype=np.uint8)
    canvas[pad_y:pad_y + nh, pad_x:pad_x + nw] = resized
    return canvas, scale, pad_x, pad_y


def preprocess(frame: np.ndarray, size: int):
    img, scale, pad_x, pad_y = letterbox(frame, size)
    blob = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    blob = np.transpose(blob, (2, 0, 1))[None]  # HWC -> NCHW
    return blob, scale, pad_x, pad_y


def postprocess(output: np.ndarray, scale: float, pad_x: int, pad_y: int,
                conf_thres: float, iou_thres: float, class_id: int = PERSON_CLASS_ID):
    """Sortie YOLOv8 (1, 84, N) -> liste de (x1, y1, x2, y2, conf) pour une classe COCO."""
    preds = output[0].T  # (N, 84) : cx, cy, w, h, 80 scores
    scores = preds[:, 4 + class_id]
    keep = scores >= conf_thres
    preds, scores = preds[keep], scores[keep]
    if len(scores) == 0:
        return []

    cx, cy, w, h = preds[:, 0], preds[:, 1], preds[:, 2], preds[:, 3]
    x1 = (cx - w / 2 - pad_x) / scale
    y1 = (cy - h / 2 - pad_y) / scale
    boxes_xywh = np.stack([x1, y1, w / scale, h / scale], axis=1)

    idx = cv2.dnn.NMSBoxes(boxes_xywh.tolist(), scores.tolist(), conf_thres, iou_thres)
    detections = []
    for i in np.array(idx).flatten():
        x, y, bw, bh = boxes_xywh[i]
        detections.append((int(x), int(y), int(x + bw), int(y + bh), float(scores[i])))
    return detections


def find_objects(output: np.ndarray, scale: float, pad_x: int, pad_y: int, conf: float,
                 iou: float, classes: dict[int, str], off_x: int = 0, off_y: int = 0):
    """Objets des classes demandées -> (liste, meilleur score brut par classe).

    off_x/off_y replacent dans l'image entière les boîtes trouvées sur un recadrage.
    """
    found, best = [], {}
    for cid, label in classes.items():
        best[label] = float(output[0][4 + cid].max())
        for x1, y1, x2, y2, c in postprocess(output, scale, pad_x, pad_y, conf, iou, cid):
            found.append({"label": label, "confidence": round(c, 3),
                          "bbox": [x1 + off_x, y1 + off_y, x2 + off_x, y2 + off_y]})
    return found, best


def iou_xyxy(a, b) -> float:
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def merge_objects(first: list[dict], second: list[dict]) -> list[dict]:
    """Fusionne deux passes : un même objet vu deux fois ne garde que la meilleure boîte."""
    merged = list(first)
    for o in second:
        same = [m for m in merged if m["label"] == o["label"] and iou_xyxy(m["bbox"], o["bbox"]) > 0.5]
        if not same:
            merged.append(o)
        elif o["confidence"] > same[0]["confidence"]:
            merged[merged.index(same[0])] = o
    return merged


def person_crop(frame: np.ndarray, box, margin: float = 0.25):
    """Zone autour de la personne (mains comprises), pour une seconde passe plus détaillée."""
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = box[:4]
    mx, my = int((x2 - x1) * margin), int((y2 - y1) * margin)
    x1, y1 = max(0, x1 - mx), max(0, y1 - my)
    x2, y2 = min(w, x2 + mx), min(h, y2 + my)
    return frame[y1:y2, x1:x2], x1, y1


def is_off_hours(now: dt.datetime, start: dt.time, end: dt.time, work_days: set[int]) -> bool:
    """Hors horaires : jour non ouvré, ou heure < start, ou heure >= end (heure locale du laptop)."""
    return now.weekday() not in work_days or not (start <= now.time() < end)


def send_alert(api_url: str, api_key: str, confidence: float, bbox, latency_ms: float,
               confirm: int, objects: list[dict], reason: str = "presence",
               off_hours: bool = False) -> None:
    """reason : presence, loitering, abandoned_object (warning) ; danger_object (critical).
    Hors horaires, toute alerte passe en critical."""
    alert_type = "intrusion"
    if reason == "abandoned_object":
        alert_type, severity = "anomaly", "warning"
        message = f"Objet abandonné : {objects[0]['label']} seul dans le champ"
    elif reason == "danger_object":
        top = max(objects, key=lambda o: o["confidence"])
        severity = "critical"
        message = f"Personne avec objet dangereux : {top['label']} (conf {top['confidence']:.2f})"
    elif reason == "loitering":
        severity, message = "warning", f"Présence prolongée devant la caméra (conf {confidence:.2f})"
    else:
        severity, message = "warning", f"Personne détectée (conf {confidence:.2f})"
    if off_hours:
        severity, message = "critical", f"Hors horaires : {message}"
    payload = {
        "source": "vision",
        "type": alert_type,
        "severity": severity,
        "dev": "cam-01",
        "message": message,
        "confidence": round(confidence, 3),
        "data": {"bbox": list(bbox), "latency_ms": round(latency_ms, 1), "confirm": confirm,
                 "reason": reason, "off_hours": off_hours, "objects": objects},
    }
    try:
        r = requests.post(f"{api_url}/api/v1/alerts", json=payload,
                          headers={"X-API-Key": api_key}, timeout=2)
        print(f"[alerte] POST /api/v1/alerts -> {r.status_code}")
    except requests.RequestException as exc:
        print(f"[alerte] API injoignable : {exc}")


class VisionShare:
    """Dernière trame brute et dernier état de détection, lus par le serveur HTTP."""

    def __init__(self, camera: str) -> None:
        self.lock = threading.Lock()
        self.frame = None
        self.status = {"online": True, "camera": camera, "person": False}

    def publish(self, frame: np.ndarray, status: dict) -> None:
        with self.lock:
            self.frame = frame
            self.status = status

    def jpeg(self):
        with self.lock:
            frame = self.frame
        if frame is None:
            return None
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return buf.tobytes() if ok else None

    def status_json(self) -> bytes:
        with self.lock:
            return json.dumps(self.status).encode()


def make_handler(share: VisionShare):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            path = self.path.split("?")[0].rstrip("/")
            if path == "/video/status":
                body = share.status_json()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif path == "/video":
                self._stream()
            else:
                self.send_error(404)

        def _stream(self) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                while True:
                    jpg = share.jpeg()
                    if jpg is not None:
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n"
                                         + f"Content-Length: {len(jpg)}\r\n\r\n".encode()
                                         + jpg + b"\r\n")
                    time.sleep(1 / STREAM_FPS)
            except (BrokenPipeError, ConnectionResetError):
                pass  # onglet du dashboard fermé ou rechargé

        def log_message(self, *args) -> None:
            pass  # pas une ligne par requête /video/status

    return Handler


def start_server(share: VisionShare, host: str, port: int) -> None:
    server = ThreadingHTTPServer((host, port), make_handler(share))
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Flux dashboard : http://{host}:{port}/video · état : /video/status")


def draw(frame, detections, objects, info, stats_text: str, alarm: bool) -> None:
    for o in info:
        x1, y1, x2, y2 = o["bbox"]
        cv2.rectangle(frame, (x1, y1), (x2, y2), (180, 180, 180), 1)
        cv2.putText(frame, f"{o['label']} {o['confidence']:.2f}", (x1, max(y1 - 6, 12)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1)
    for o in objects:
        x1, y1, x2, y2 = o["bbox"]
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 165, 255), 2)
        cv2.putText(frame, f"{o['label']} {o['confidence']:.2f}", (x1, max(y1 - 6, 12)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 2)
    for x1, y1, x2, y2, conf in detections:
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(frame, f"person {conf:.2f}", (x1, max(y1 - 6, 12)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
    cv2.putText(frame, stats_text, (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)
    if alarm:
        cv2.putText(frame, "INTRUSION", (8, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 3)


def main() -> None:
    parser = argparse.ArgumentParser(description="Sentinel-X vision")
    parser.add_argument("--source", default=os.getenv("SENTINEL_CAMERA", "0"),
                        help="morceau du nom ('c270'), /dev/videoN ou index ; défaut $SENTINEL_CAMERA")
    parser.add_argument("--list-cameras", action="store_true", help="liste les caméras et quitte")
    parser.add_argument("--model", default="models/yolov8n-320.onnx")
    parser.add_argument("--imgsz", type=int, default=320)
    parser.add_argument("--conf", type=float, default=0.5)
    parser.add_argument("--iou", type=float, default=0.45)
    parser.add_argument("--confirm", type=int, default=3, help="trames consécutives avant alerte")
    parser.add_argument("--obj-conf", type=float, default=0.35,
                        help="seuil des objets dangereux (petits en main : plus bas que --conf)")
    parser.add_argument("--no-crop-pass", dest="crop_pass", action="store_false",
                        help="sans 2e passe sur la personne (plus rapide, objets moins bien vus)")
    parser.add_argument("--debug-objects", action="store_true",
                        help="affiche chaque seconde le meilleur score couteau/ciseaux/batte")
    parser.add_argument("--info-conf", type=float, default=0.4,
                        help="seuil des objets d'information (téléphone, sacs, valise, ordinateur)")
    parser.add_argument("--abandon", type=float, default=20.0,
                        help="secondes d'un sac seul (sans personne) avant « objet abandonné »")
    parser.add_argument("--loiter", type=float, default=30.0,
                        help="secondes de présence continue avant « présence prolongée »")
    parser.add_argument("--work-start", type=dt.time.fromisoformat, default="08:30",
                        help="début des heures ouvrées (HH:MM)")
    parser.add_argument("--work-end", type=dt.time.fromisoformat, default="17:00",
                        help="fin des heures ouvrées (HH:MM) ; après, toute alerte est critique")
    parser.add_argument("--work-days", default="0,1,2,3,4",
                        help="jours ouvrés, 0 = lundi … 6 = dimanche")
    parser.add_argument("--cooldown", type=float, default=10.0, help="secondes entre deux alertes")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--no-show", action="store_true", help="sans fenêtre (serveur)")
    # 127.0.0.1 : le flux n'est pas exposé sur le réseau. Mettre 0.0.0.0 seulement si
    # Caddy (dans Docker) doit le joindre via host.docker.internal.
    parser.add_argument("--host", default="127.0.0.1", help="adresse du flux dashboard")
    parser.add_argument("--port", type=int, default=8081, help="port du flux dashboard (0 = désactivé)")
    args = parser.parse_args()
    work_days = {int(d) for d in args.work_days.split(",")}

    if args.list_cameras:
        for path, name in list_cameras():
            print(f"{path}  {name}")
        return

    api_url = os.getenv("SENTINEL_API_URL")  # vide = pas d'envoi, juste un print
    api_key = os.getenv("SENTINEL_API_KEY", "")

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = args.threads
    session = ort.InferenceSession(args.model, opts, providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    cam = LatestFrameCapture(resolve_source(args.source), 640, 480)
    share = VisionShare(str(args.source))
    if args.port:
        start_server(share, args.host, args.port)
    infer_ms = deque(maxlen=200)
    total_ms = deque(maxlen=200)
    consecutive, last_alert = 0, 0.0
    threat_frames, last_reason = 0, ""
    debug_best, debug_t = {}, time.time()
    abandoned_since, bag_seen, abandon_sent = None, 0.0, False
    present_since, last_seen = None, 0.0  # début de la présence en cours, dernière vue
    stats = ""
    print("'q' ou Ctrl+C pour quitter. Alertes API :", api_url or "désactivées")

    try:
        while True:
            frame = cam.read()
            if frame is None:
                time.sleep(0.01)
                continue

            t0 = time.perf_counter()
            blob, scale, pad_x, pad_y = preprocess(frame, args.imgsz)
            t1 = time.perf_counter()
            output = session.run(None, {input_name: blob})[0]
            t2 = time.perf_counter()
            detections = postprocess(output, scale, pad_x, pad_y, args.conf, args.iou)
            # Passe 1 sur l'image entière. Passe 2 sur la personne : en 320 px un objet tenu
            # en main ne fait que quelques pixels ; recadré, il apparaît 2 à 3 fois plus grand.
            danger, best_scores = find_objects(output, scale, pad_x, pad_y, args.obj_conf,
                                               args.iou, DANGER_CLASSES)
            info, _ = find_objects(output, scale, pad_x, pad_y, args.info_conf, args.iou,
                                   INFO_CLASSES)
            if detections and args.crop_pass:
                crop, ox, oy = person_crop(frame, max(detections, key=lambda d: d[4]))
                if crop.shape[0] >= 32 and crop.shape[1] >= 32:
                    cblob, cs, cpx, cpy = preprocess(crop, args.imgsz)
                    cout = session.run(None, {input_name: cblob})[0]
                    cdanger, cbest = find_objects(cout, cs, cpx, cpy, args.obj_conf, args.iou,
                                                  DANGER_CLASSES, ox, oy)
                    cinfo, _ = find_objects(cout, cs, cpx, cpy, args.info_conf, args.iou,
                                            INFO_CLASSES, ox, oy)
                    danger = merge_objects(danger, cdanger)
                    info = merge_objects(info, cinfo)
                    best_scores = {k: max(v, cbest[k]) for k, v in best_scores.items()}
            # Un objet dangereux seul (couteau posé sur une table) ne compte pas
            objects = danger if detections else []
            if args.debug_objects:
                for k, v in best_scores.items():
                    debug_best[k] = max(debug_best.get(k, 0.0), v)
                if time.time() - debug_t > 1.0:
                    print("[objets] meilleur score/s : "
                          + " · ".join(f"{k} {v:.2f}" for k, v in debug_best.items())
                          + (f" (seuil {args.obj_conf})" if debug_best else " (personne absente)"),
                          flush=True)
                    debug_best, debug_t = {}, time.time()
            t3 = time.perf_counter()

            infer_ms.append((t2 - t1) * 1000)
            total_ms.append((t3 - t0) * 1000)

            consecutive = consecutive + 1 if detections else 0
            threat_frames = threat_frames + 1 if objects else 0
            now = time.time()
            # Une image ratée ne remet pas le chrono à zéro : il faut 2 s sans personne
            if detections:
                last_seen = now
                present_since = present_since or now
            elif present_since and now - last_seen > 2.0:
                present_since = None
            present_s = now - present_since if present_since else 0.0
            alarm = consecutive >= args.confirm
            threat = threat_frames >= args.confirm
            loitering = alarm and present_s >= args.loiter
            off_hours = is_off_hours(dt.datetime.now(), args.work_start, args.work_end, work_days)

            # Gravité croissante : une aggravation part tout de suite, sans attendre le cooldown
            reason = "danger_object" if threat else "loitering" if loitering else "presence"
            escalated = alarm and reason != last_reason and (
                reason == "danger_object" or (reason == "loitering" and last_reason == "presence"))
            if alarm and (escalated or now - last_alert > args.cooldown):
                last_alert, last_reason = now, reason
                best = max(detections, key=lambda d: d[4])
                if api_url:
                    threading.Thread(target=send_alert, daemon=True,
                                     args=(api_url, api_key, best[4], best[:4], total_ms[-1],
                                           consecutive, objects, reason, off_hours)).start()
                else:
                    print(f"[alerte] {reason} conf={best[4]:.2f} {[o['label'] for o in objects]}"
                          " (API non configurée)")
            if not detections:
                last_reason = ""

            # Objet abandonné : un sac visible sans personne pendant --abandon secondes.
            # Le retour d'une personne (qui le reprend) arrête le chrono.
            bags = [o for o in info if o["label"] in BAG_LABELS]
            if bags and not detections:
                bag_seen = now
                abandoned_since = abandoned_since or now
            elif abandoned_since and (detections or now - bag_seen > 2.0):
                abandoned_since, abandon_sent = None, False
            abandoned_s = now - abandoned_since if abandoned_since else 0.0
            abandoned = abandoned_s >= args.abandon
            if abandoned and not abandon_sent and bags:
                abandon_sent = True
                bag = max(bags, key=lambda o: o["confidence"])
                if api_url:
                    threading.Thread(target=send_alert, daemon=True,
                                     args=(api_url, api_key, bag["confidence"], bag["bbox"],
                                           total_ms[-1], 0, [bag], "abandoned_object",
                                           off_hours)).start()
                else:
                    print(f"[alerte] objet abandonné : {bag['label']} (API non configurée)")

            stats = (f"infer {np.mean(infer_ms):.0f}ms | total {np.mean(total_ms):.0f}ms "
                     f"| p95 {np.percentile(total_ms, 95):.0f}ms | {1000 / np.mean(total_ms):.0f} FPS")

            # Avant draw() : le dashboard reçoit l'image brute et dessine son propre HUD
            top = max(detections, key=lambda d: d[4]) if detections else None
            share.publish(frame.copy(), {
                "online": True,
                "camera": str(args.source),
                "ts": time.time(),
                "width": frame.shape[1],
                "height": frame.shape[0],
                "person": top is not None,
                "alarm": alarm,
                "confidence": round(top[4], 3) if top else 0.0,
                "bbox": list(top[:4]) if top else None,
                "confirm": min(consecutive, args.confirm),
                "objects": objects,
                "info_objects": info,
                "abandoned": abandoned,
                "abandoned_s": round(abandoned_s, 1),
                "threat": threat,
                "present_s": round(present_s, 1),
                "loitering": loitering,
                "off_hours": off_hours,
                "confirm_needed": args.confirm,
                "infer_ms": round(float(np.mean(infer_ms)), 1),
                "total_ms": round(float(np.mean(total_ms)), 1),
                "fps": round(1000 / float(np.mean(total_ms)), 1),
            })

            if not args.no_show:
                draw(frame, detections, objects, info, stats, alarm)
                cv2.imshow("Sentinel-X vision", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
            elif len(total_ms) == total_ms.maxlen:
                print(stats)
                total_ms.clear()
    except KeyboardInterrupt:
        pass
    finally:
        cam.release()
        cv2.destroyAllWindows()
        print("Dernières stats :", stats)


if __name__ == "__main__":
    main()
