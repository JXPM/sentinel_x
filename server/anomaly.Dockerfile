# Service IA anomalies : entraîne le modèle sur un normal synthétique calibré, puis surveille les mesures réelles.
FROM python:3.11-slim
WORKDIR /srv
COPY ai/anomalies/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY ai/anomalies/ ./
# Niveau normal du boîtier, mesuré après calibration du MQ-2 (gaz en ppm) :
# docker compose build --build-arg GAS_PPM=4.3 --build-arg GAS_NOISE_PPM=0.5 anomaly
ARG GAS_PPM=4.3
ARG GAS_NOISE_PPM=0.5
ARG TEMPERATURE=24
ARG HUMIDITY=50
RUN python generate_sample_data.py --gas-ppm ${GAS_PPM} --gas-noise-ppm ${GAS_NOISE_PPM} \
        --temperature ${TEMPERATURE} --humidity ${HUMIDITY} \
 && python train.py
USER 10001
CMD ["python", "service.py"]
