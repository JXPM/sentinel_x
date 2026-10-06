"""Exporte YOLOv8n en ONNX (entrée carrée imgsz) dans models/."""
import argparse
import shutil
from pathlib import Path

from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", default="yolov8n.pt")
    parser.add_argument("--imgsz", type=int, default=320)
    args = parser.parse_args()

    models_dir = Path(__file__).parent / "models"
    models_dir.mkdir(exist_ok=True)

    exported = YOLO(args.weights).export(format="onnx", imgsz=args.imgsz, opset=12, simplify=True)
    target = models_dir / f"{Path(args.weights).stem}-{args.imgsz}.onnx"
    shutil.move(exported, target)
    print(f"Modèle exporté : {target}")


if __name__ == "__main__":
    main()
