# Service vision Sentinel-X : détection YOLOv8n sur la webcam C270 (/dev/video0, via usbipd)
FROM python:3.11-slim

WORKDIR /srv
ENV PYTHONUNBUFFERED=1 YOLO_CONFIG_DIR=/tmp/ultralytics

# PyTorch version CPU (sans CUDA : image ~10x plus légère), puis Ultralytics
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision \
 && pip install --no-cache-dir ultralytics "paho-mqtt>=2,<3" \
 && pip uninstall -y opencv-python \
 && pip install --no-cache-dir opencv-python-headless

# Modèle téléchargé à la construction : rien à télécharger au démarrage
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY server/vision/detect.py ./detect.py

EXPOSE 8081
CMD ["python", "detect.py", "--source", "0", "--mqtt", "mosquitto", "--host", "0.0.0.0"]
