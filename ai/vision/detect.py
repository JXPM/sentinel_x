"""Sentinel-X : détection de présence humaine sur la webcam.

Pipeline : webcam 640x480 -> letterbox imgsz -> YOLOv8n ONNX -> NMS -> classe person
-> confirmation sur N trames -> POST /api/v1/alerts (avec cooldown).
"""
import argparse
import os
import threading
import time
from collections import deque

import cv2
import numpy as np
import onnxruntime as ort
import requests

PERSON_CLASS_ID = 0


class LatestFrameCapture:
    """Lit la webcam dans un thread et ne garde que la dernière trame (pas de retard qui s'accumule)."""

    def __init__(self, source: int, width: int, height: int) -> None:
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
                conf_thres: float, iou_thres: float):
    """Sortie YOLOv8 (1, 84, N) -> liste de (x1, y1, x2, y2, conf) pour la classe person."""
    preds = output[0].T  # (N, 84) : cx, cy, w, h, 80 scores
    scores = preds[:, 4 + PERSON_CLASS_ID]
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


def send_alert(api_url: str, api_key: str, confidence: float, bbox, latency_ms: float) -> None:
    payload = {
        "source": "vision",
        "type": "intrusion",
        "severity": "warning",
        "dev": "cam-01",
        "message": f"Personne détectée (conf {confidence:.2f})",
        "confidence": round(confidence, 3),
        "data": {"bbox": list(bbox), "latency_ms": round(latency_ms, 1)},
    }
    try:
        r = requests.post(f"{api_url}/api/v1/alerts", json=payload,
                          headers={"X-API-Key": api_key}, timeout=2)
        print(f"[alerte] POST /api/v1/alerts -> {r.status_code}")
    except requests.RequestException as exc:
        print(f"[alerte] API injoignable : {exc}")


def draw(frame, detections, stats_text: str, alarm: bool) -> None:
    for x1, y1, x2, y2, conf in detections:
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(frame, f"person {conf:.2f}", (x1, max(y1 - 6, 12)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
    cv2.putText(frame, stats_text, (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)
    if alarm:
        cv2.putText(frame, "INTRUSION", (8, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 3)


def main() -> None:
    parser = argparse.ArgumentParser(description="Sentinel-X vision")
    parser.add_argument("--source", type=int, default=0, help="index webcam (/dev/videoN)")
    parser.add_argument("--model", default="models/yolov8n-320.onnx")
    parser.add_argument("--imgsz", type=int, default=320)
    parser.add_argument("--conf", type=float, default=0.5)
    parser.add_argument("--iou", type=float, default=0.45)
    parser.add_argument("--confirm", type=int, default=3, help="trames consécutives avant alerte")
    parser.add_argument("--cooldown", type=float, default=10.0, help="secondes entre deux alertes")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--no-show", action="store_true", help="sans fenêtre (serveur)")
    args = parser.parse_args()

    api_url = os.getenv("SENTINEL_API_URL")  # vide = pas d'envoi, juste un print
    api_key = os.getenv("SENTINEL_API_KEY", "")

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = args.threads
    session = ort.InferenceSession(args.model, opts, providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    cam = LatestFrameCapture(args.source, 640, 480)
    infer_ms = deque(maxlen=200)
    total_ms = deque(maxlen=200)
    consecutive, last_alert = 0, 0.0
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
            t3 = time.perf_counter()

            infer_ms.append((t2 - t1) * 1000)
            total_ms.append((t3 - t0) * 1000)

            consecutive = consecutive + 1 if detections else 0
            alarm = consecutive >= args.confirm
            if alarm and time.time() - last_alert > args.cooldown:
                last_alert = time.time()
                best = max(detections, key=lambda d: d[4])
                if api_url:
                    threading.Thread(target=send_alert, daemon=True,
                                     args=(api_url, api_key, best[4], best[:4], total_ms[-1])).start()
                else:
                    print(f"[alerte] intrusion conf={best[4]:.2f} (API non configurée)")

            stats = (f"infer {np.mean(infer_ms):.0f}ms | total {np.mean(total_ms):.0f}ms "
                     f"| p95 {np.percentile(total_ms, 95):.0f}ms | {1000 / np.mean(total_ms):.0f} FPS")

            if not args.no_show:
                draw(frame, detections, stats, alarm)
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
