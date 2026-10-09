"""Sentinel-X · service vision (cam-01)

Lit la webcam, détecte personnes et objets avec YOLOv8n, et sert au dashboard :
  GET /video         flux MJPEG (images brutes : le dashboard dessine lui-même le HUD)
  GET /video/status  état JSON (contrat VisionStatus du dashboard)
  GET /              page de test locale (http://localhost:8081)
Publie aussi les alertes caméra sur MQTT (sentinel/groupe1/cam-01/alert) : le pont de l'API
les enregistre et les pousse au dashboard. La présence PIR est lue sur la télémétrie de l'ESP
pour confirmer une intrusion (PIR + caméra).
Les seuils et les heures ouvrées réglés dans l'onglet « Règles » du dashboard arrivent en message
retenu sur sentinel/groupe1/cam-01/config : ils s'appliquent sans redémarrer (les options de la
ligne de commande ne servent que de valeurs de départ).

Utilisation :
  python detect.py --list          liste les caméras et enregistre une photo de chacune (camN.jpg)
  python detect.py                 caméra couleur choisie automatiquement, port 8081
  python detect.py --source 1      caméra n°1
"""
import argparse
import datetime
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo

import cv2
import numpy as np

try:
    import paho.mqtt.client as mqtt
except ImportError:          # MQTT facultatif : la vidéo et l'état marchent sans
    mqtt = None

# Classes COCO utiles à Sentinel-X
CLASSES = {0: "person", 24: "backpack", 26: "handbag", 28: "suitcase", 34: "baseball bat",
           43: "knife", 63: "laptop", 67: "cell phone", 76: "scissors"}
DANGER = {"knife", "scissors", "baseball bat"}
BAGS = {"backpack", "handbag", "suitcase"}
INFO = {"backpack", "handbag", "suitcase", "laptop", "cell phone"}
FR = {"knife": "couteau", "scissors": "ciseaux", "baseball bat": "batte"}
FR_BAG = {"backpack": "sac à dos", "handbag": "sac à main", "suitcase": "valise"}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def fr2(v):
    return f"{v:.2f}".replace(".", ",")


# =============================================================
#  Caméra
# =============================================================
def open_source(src, w, h):
    if str(src).isdigit():
        backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
        cap = cv2.VideoCapture(int(src), backend)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))   # MJPEG : 10x moins de débit USB
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    else:                    # fichier vidéo, image ou URL (tests)
        cap = cv2.VideoCapture(src)
    return cap


def first_frame(cap, tries=10):
    frame = None
    for _ in range(tries):   # certaines webcams envoient des images noires au démarrage
        ok, f = cap.read()
        if ok and f is not None:
            frame = f
            if f.mean() > 5:
                break
    return frame


def is_color(frame):
    small = cv2.resize(frame, (64, 48)).astype(np.int16)
    diff = np.abs(small[:, :, 0] - small[:, :, 1]).mean() + np.abs(small[:, :, 1] - small[:, :, 2]).mean()
    return diff > 2          # caméra infrarouge (Windows Hello) = image en niveaux de gris


def probe(max_index=5, save=False):
    found = []
    for i in range(max_index):
        cap = open_source(i, 640, 480)
        if not cap.isOpened():
            cap.release()
            continue
        f = first_frame(cap)
        cap.release()
        if f is None:
            continue
        color = is_color(f)
        found.append((i, f.shape[1], f.shape[0], color))
        if save:
            cv2.imwrite(f"cam{i}.jpg", f)
    return found


class Camera(threading.Thread):
    """Lit la caméra en continu ; garde la dernière image et sa version JPEG."""

    def __init__(self, src, w, h):
        super().__init__(daemon=True)
        self.src, self.w, self.h = src, w, h
        self.is_file = not str(src).isdigit()
        self.cond = threading.Condition()
        self.frame = None
        self.jpeg = None
        self.seq = 0
        self.last_ok = 0.0

    def run(self):
        while True:
            cap = open_source(self.src, self.w, self.h)
            if not cap.isOpened():
                log(f"[cam] impossible d'ouvrir la caméra {self.src}, nouvel essai dans 2 s")
                time.sleep(2)
                continue
            log(f"[cam] caméra {self.src} ouverte")
            delay = 1 / (cap.get(cv2.CAP_PROP_FPS) or 25) if self.is_file else 0
            fails = 0
            while True:
                ok, f = cap.read()
                if not ok or f is None:
                    if self.is_file:                     # fichier de test : on reboucle
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ok, f = cap.read()
                    if not ok or f is None:
                        fails += 1
                        if fails > 30:
                            log("[cam] plus d'image, réouverture de la caméra")
                            break
                        time.sleep(0.05)
                        continue
                fails = 0
                ok, buf = cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 75])
                with self.cond:
                    self.frame = f
                    if ok:
                        self.jpeg = buf.tobytes()
                    self.seq += 1
                    self.last_ok = time.time()
                    self.cond.notify_all()
                if delay:
                    time.sleep(delay)
            cap.release()
            time.sleep(1)

    def wait(self, seq, timeout=2.0):
        with self.cond:
            self.cond.wait_for(lambda: self.seq != seq, timeout)
            return self.seq, self.frame, self.jpeg


# =============================================================
#  MQTT : alertes + présence PIR de l'ESP
# =============================================================
class Bus:
    def __init__(self, args):
        self.args = args
        self.topic = args.topic.rstrip("/")
        self.pir = False
        self.pir_ts = 0.0
        self.device = "edge01"
        self.client = None
        if args.no_mqtt:
            return
        if mqtt is None:
            log("[mqtt] paho-mqtt absent : alertes caméra désactivées (pip install paho-mqtt)")
            return
        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="sentinel-vision-" + args.camera)
        if getattr(args, "mqtt_user", ""):
            c.username_pw_set(args.mqtt_user, args.mqtt_pass)
        c.on_connect = self._on_connect
        c.on_message = self._on_message
        c.reconnect_delay_set(1, 30)
        c.connect_async(args.mqtt, args.mqtt_port, keepalive=30)
        c.loop_start()
        self.client = c

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code.is_failure:
            log(f"[mqtt] connexion refusée : {reason_code}")
            return
        client.subscribe("sentinel/+/+/telemetry")
        client.subscribe(self.topic + "/config", qos=1)
        log("[mqtt] connecté, alertes caméra sur " + self.topic + "/alert")

    def _on_message(self, client, userdata, msg):
        try:
            d = json.loads(msg.payload)
        except ValueError:
            return
        if msg.topic == self.topic + "/config":
            apply_config(self.args, d)
            return
        self.pir = bool(d.get("presence", d.get("motion", False)))
        self.pir_ts = time.time()
        self.device = str(d.get("device") or msg.topic.split("/")[-2])

    def pir_recent(self):
        return self.pir and time.time() - self.pir_ts < 5

    def alert(self, **a):
        log(f"[alerte] {a['severity']} · {a['message']}")
        if self.client is not None:
            self.client.publish(self.topic + "/alert", json.dumps(a), qos=1)


def apply_config(a, d):
    """Réglages venus du dashboard : chaque valeur est bornée ici aussi, une valeur hors bornes est ignorée."""
    if not isinstance(d, dict):
        return
    changed = []

    def num(key, attr, lo, hi, cast):
        v = d.get(key)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi:
            v = cast(v)
            if getattr(a, attr) != v:
                setattr(a, attr, v)
                changed.append(f"{attr}={v}")

    num("loiter_s", "loiter", 5, 600, float)
    num("abandon_s", "abandon", 5, 600, float)
    num("confirm", "confirm", 1, 10, int)
    num("person_conf", "conf", 0.2, 0.95, float)
    num("obj_conf", "obj_conf", 0.2, 0.95, float)
    try:
        start = datetime.time.fromisoformat(d["work_start"]) if "work_start" in d else a.work_start
        end = datetime.time.fromisoformat(d["work_end"]) if "work_end" in d else a.work_end
        days = d.get("work_days")
        days = ",".join(str(int(x)) for x in days if 0 <= int(x) <= 6) if isinstance(days, list) else a.work_days
        if start < end and (start, end, days) != (a.work_start, a.work_end, a.work_days):
            a.work_start, a.work_end, a.work_days = start, end, days
            changed.append(f"heures={start:%H:%M}-{end:%H:%M} jours={days or 'aucun'}")
    except (TypeError, ValueError):
        pass
    if changed:
        log("[réglages] " + ", ".join(changed))


# =============================================================
#  Détection
# =============================================================
def iou_touch(a, b, margin=0.15):
    """Vrai si la boîte a touche la boîte b élargie de 15 % (objet tenu par la personne)."""
    bw, bh = b[2] - b[0], b[3] - b[1]
    x1, y1, x2, y2 = b[0] - bw * margin, b[1] - bh * margin, b[2] + bw * margin, b[3] + bh * margin
    return a[0] < x2 and a[2] > x1 and a[1] < y2 and a[3] > y1


def is_off_hours(now: datetime.datetime, start: datetime.time, end: datetime.time, work_days: set[int]) -> bool:
    """Hors horaires : jour non ouvré, ou heure < start, ou heure >= end."""
    return now.weekday() not in work_days or not (start <= now.time() < end)


class Detector(threading.Thread):
    def __init__(self, cam, bus, args):
        super().__init__(daemon=True)
        self.cam, self.bus, self.args = cam, bus, args
        self.lock = threading.Lock()
        self.status = {"online": True, "camera": str(args.camera), "ts": 0, "width": args.width, "height": args.height,
                       "person": False, "alarm": False, "confidence": 0.0, "bbox": None,
                       "confirm": 0, "confirm_needed": args.confirm, "objects": [], "threat": False,
                       "info_objects": [], "abandoned": False, "abandoned_s": 0, "present_s": 0,
                       "loitering": False, "infer_ms": 0, "total_ms": 0, "fps": 0}
        self.ready = threading.Event()

    def snapshot(self):
        with self.lock:
            return dict(self.status)

    def run(self):
        from ultralytics import YOLO
        a = self.args
        log(f"[ia] chargement du modèle {a.model} (premier lancement : téléchargement)")
        model = YOLO(a.model)
        classes = list(CLASSES)

        seq, consec, threat_consec, miss = 0, 0, 0, 0
        present_since = None
        last_person = 0.0
        bag_alone_since = None
        fps = 0.0
        last_t = time.time()
        episode = {"warn": False, "fusion": False, "threat": False, "loiter": False}
        abandon_alerted = False
        last_alert = {}
        last_log = 0.0
        # Heures ouvrées en heure de Paris : le conteneur, lui, est en UTC
        tz = ZoneInfo(a.tz)
        off_hours = False
        self.ready.set()

        def hh(message):
            """Hors horaires, toute alerte est préfixée (et passe en critique)."""
            return f"Hors horaires : {message}" if off_hours else message

        def can_alert(key, gap=30):
            if time.time() - last_alert.get(key, 0) < gap:
                return False
            last_alert[key] = time.time()
            return True

        while True:
            seq, frame, _ = self.cam.wait(seq)
            if frame is None:
                continue
            t0 = time.time()
            # Seuils relus à chaque image : le dashboard peut les changer à chaud (apply_config)
            low = min(a.conf, a.obj_conf)
            r = model.predict(frame, imgsz=a.imgsz, conf=low, classes=classes, verbose=False)[0]
            total_ms = (time.time() - t0) * 1000
            infer_ms = float(r.speed.get("inference", total_ms))

            persons, others = [], []
            if r.boxes is not None and len(r.boxes):
                xyxy = r.boxes.xyxy.cpu().numpy()
                cls = r.boxes.cls.cpu().numpy().astype(int)
                conf = r.boxes.conf.cpu().numpy()
                for box, c, p in zip(xyxy, cls, conf):
                    label = CLASSES.get(int(c))
                    b = [int(round(v)) for v in box]
                    if label == "person" and p >= a.conf:
                        persons.append((float(p), b))
                    elif label and label != "person" and p >= a.obj_conf:
                        others.append({"label": label, "confidence": round(float(p), 2), "bbox": b})

            now = time.time()
            work_days = {int(x) for x in a.work_days.split(",") if x.strip()}
            off_hours = is_off_hours(datetime.datetime.now(tz), a.work_start, a.work_end, work_days)
            h, w = frame.shape[:2]
            person = bool(persons)
            best = max(persons, default=(0.0, None))
            if person:
                consec += 1
                miss = 0
                last_person = now
                present_since = present_since or now
            else:
                miss += 1
                if miss > 2:                        # 3 images sans personne : fin de la confirmation
                    consec = 0
                if present_since and now - last_person > 2:
                    present_since = None
                    episode = {"warn": False, "fusion": False, "threat": False, "loiter": False}
            confirm = min(consec, a.confirm)
            locked = person and confirm >= a.confirm
            present_s = round(now - present_since, 1) if present_since else 0

            danger = [o for o in others if o["label"] in DANGER and any(iou_touch(o["bbox"], pb) for _, pb in persons)]
            threat_consec = threat_consec + 1 if danger else 0
            threat = threat_consec >= a.confirm
            info = [o for o in others if o["label"] in INFO]

            bag = any(o["label"] in BAGS for o in others)
            if bag and not person and now - last_person > 2:
                bag_alone_since = bag_alone_since or now
            else:
                bag_alone_since = None
            abandoned_s = round(now - bag_alone_since, 1) if bag_alone_since else 0
            abandoned = abandoned_s >= a.abandon
            if not bag_alone_since:
                abandon_alerted = False

            dt = now - last_t
            last_t = now
            if dt > 0:
                fps = 1 / dt if fps == 0 else fps * 0.9 + (1 / dt) * 0.1

            st = {"online": True, "camera": str(a.camera), "ts": now, "width": w, "height": h,
                  "person": person, "alarm": bool(locked or threat), "confidence": round(best[0], 2),
                  "bbox": best[1], "confirm": confirm, "confirm_needed": a.confirm,
                  "objects": danger, "threat": threat, "info_objects": info,
                  "abandoned": abandoned, "abandoned_s": abandoned_s, "present_s": present_s,
                  "loitering": present_s >= a.loiter, "off_hours": off_hours,
                  "loiter_s": a.loiter, "abandon_s": a.abandon, "infer_ms": round(infer_ms, 1),
                  "total_ms": round(total_ms, 1), "fps": round(fps, 1)}
            with self.lock:
                self.status = st

            # Alertes : une par épisode de présence, au plus une toutes les 30 s par type
            if locked and not episode["warn"] and can_alert("warn"):
                episode["warn"] = True
                self.bus.alert(source="vision", type="intrusion", severity="critical" if off_hours else "warning",
                               dev=a.camera, message=hh(f"Personne détectée (confiance {fr2(best[0])})"),
                               confidence=round(best[0], 2), data={"off_hours": off_hours, "reason": "person"})
            if locked and self.bus.pir_recent() and not episode["fusion"] and can_alert("fusion"):
                episode["fusion"] = True
                self.bus.alert(source="fusion", type="intrusion", severity="critical", dev=self.bus.device[:32],
                               message=hh("Le PIR et la caméra concordent : intrusion confirmée"),
                               confidence=round(best[0], 2), data={"off_hours": off_hours, "reason": "fusion"})
            if threat and not episode["threat"] and can_alert("threat"):
                episode["threat"] = True
                top = max(danger, key=lambda o: o["confidence"])
                self.bus.alert(source="vision", type="intrusion", severity="critical", dev=a.camera,
                               message=hh(f"Objet dangereux : {FR.get(top['label'], top['label'])} tenu par une personne"),
                               confidence=top["confidence"], data={"off_hours": off_hours, "reason": "danger_object",
                                                                   "object": top["label"]})
            # Présence prolongée et objet abandonné : attention en journée, critique hors horaires
            if present_s >= a.loiter and not episode["loiter"] and can_alert("loiter"):
                episode["loiter"] = True
                self.bus.alert(source="vision", type="intrusion", severity="critical" if off_hours else "warning",
                               dev=a.camera, message=hh(f"Présence prolongée : personne devant la caméra depuis {present_s:.0f} s"),
                               confidence=round(best[0], 2),
                               data={"off_hours": off_hours, "reason": "loitering", "seconds": present_s})
            if abandoned and not abandon_alerted and can_alert("abandon"):
                abandon_alerted = True
                bag = next((o["label"] for o in others if o["label"] in BAGS), "sac")
                self.bus.alert(source="vision", type="anomaly", severity="critical" if off_hours else "warning",
                               dev=a.camera, message=hh(f"Objet abandonné : {FR_BAG.get(bag, bag)} seul depuis {abandoned_s:.0f} s"),
                               data={"off_hours": off_hours, "reason": "abandoned", "object": bag, "seconds": abandoned_s})

            if now - last_log > 10:
                last_log = now
                log(f"[ia] {fps:.1f} img/s · inférence {infer_ms:.0f} ms · personne : "
                    + (f"oui ({fr2(best[0])})" if person else "non"))


# =============================================================
#  Serveur HTTP
# =============================================================
PAGE = b"""<!doctype html><meta charset="utf-8"><title>Sentinel-X vision</title>
<body style="background:#0f0f18;color:#ecebff;font-family:sans-serif;margin:16px">
<h3>Sentinel-X &middot; service vision</h3><img src="/video" style="max-width:100%;border:1px solid #333">
<pre id="s"></pre><script>
setInterval(()=>fetch('/video/status').then(r=>r.json()).then(j=>s.textContent=JSON.stringify(j,null,1)),500)
</script></body>"""


def make_handler(cam, det):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _head(self, code, ctype, length=None):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            if length is not None:
                self.send_header("Content-Length", str(length))
            self.end_headers()

        def do_GET(self):
            path = self.path.split("?")[0].rstrip("/") or "/"
            if path == "/video/status":
                body = json.dumps(det.snapshot()).encode()
                self._head(200, "application/json", len(body))
                self.wfile.write(body)
            elif path == "/video":
                self._head(200, "multipart/x-mixed-replace; boundary=frame")
                seq = 0
                try:
                    while True:
                        seq, _, jpeg = cam.wait(seq)
                        if jpeg is None:
                            continue
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                                         + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n")
                        self.wfile.flush()
                        time.sleep(0.04)          # ~25 img/s max par spectateur
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                    pass
            elif path == "/":
                self._head(200, "text/html; charset=utf-8", len(PAGE))
                self.wfile.write(PAGE)
            else:
                self._head(404, "text/plain", 0)

    return Handler


# =============================================================
#  Démarrage
# =============================================================
def main():
    p = argparse.ArgumentParser(description="Sentinel-X · service vision")
    p.add_argument("--source", default="auto", help="auto, numéro de caméra (0, 1…) ou fichier vidéo")
    p.add_argument("--list", action="store_true", help="liste les caméras et enregistre camN.jpg")
    p.add_argument("--width", type=int, default=640)
    p.add_argument("--height", type=int, default=480)
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8081)
    p.add_argument("--model", default="yolov8n.pt")
    p.add_argument("--imgsz", type=int, default=320)
    p.add_argument("--conf", type=float, default=0.5, help="confiance minimale pour une personne")
    p.add_argument("--obj-conf", type=float, default=0.35, help="confiance minimale pour un objet")
    p.add_argument("--confirm", type=int, default=3, help="images consécutives pour confirmer")
    p.add_argument("--loiter", type=float, default=30, help="présence prolongée au-delà de N s")
    p.add_argument("--abandon", type=float, default=20, help="sac seul au-delà de N s")
    p.add_argument("--work-start", type=datetime.time.fromisoformat, default="08:30",
                   help="début des heures ouvrées (HH:MM)")
    p.add_argument("--work-end", type=datetime.time.fromisoformat, default="17:00",
                   help="fin des heures ouvrées (HH:MM) ; en dehors, toute alerte est critique")
    p.add_argument("--work-days", default="0,1,2,3,4", help="jours ouvrés, 0 = lundi … 6 = dimanche")
    p.add_argument("--tz", default="Europe/Paris", help="fuseau des heures ouvrées")
    p.add_argument("--camera", default="cam-01")
    p.add_argument("--mqtt", default="localhost")
    p.add_argument("--mqtt-port", type=int, default=1883)
    p.add_argument("--topic", default="sentinel/groupe1/cam-01")
    p.add_argument("--mqtt-user", default=__import__("os").environ.get("MQTT_USER", ""))
    p.add_argument("--mqtt-pass", default=__import__("os").environ.get("MQTT_PASS", ""))
    p.add_argument("--no-mqtt", action="store_true")
    a = p.parse_args()

    if a.list or a.source == "auto":
        cams = probe(save=a.list)
        for i, w, h, color in cams:
            log(f"[cam] caméra {i} : {w}x{h} · {'couleur' if color else 'infrarouge / noir et blanc'}"
                + (f" · photo cam{i}.jpg" if a.list else ""))
        if a.list:
            if not cams:
                log("[cam] aucune caméra trouvée")
            return
        colors = [c for c in cams if c[3]]
        if not cams:
            sys.exit("Aucune caméra trouvée : branche la webcam ou ferme l'appli qui l'utilise (Teams, Caméra…)")
        a.source = str((colors or cams)[0][0])
        log(f"[cam] caméra {a.source} choisie (autre choix : --source N)")

    cam = Camera(a.source, a.width, a.height)
    cam.start()
    bus = Bus(a)
    det = Detector(cam, bus, a)
    det.start()

    srv = ThreadingHTTPServer((a.host, a.port), make_handler(cam, det))
    srv.daemon_threads = True
    log(f"[http] vidéo sur http://localhost:{a.port}/video · état sur /video/status · test sur http://localhost:{a.port}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log("arrêt")


if __name__ == "__main__":
    main()