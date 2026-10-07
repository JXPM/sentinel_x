FROM python:3.11-slim

WORKDIR /srv

RUN pip install --no-cache-dir fastapi "uvicorn[standard]"

# Chemin relatif à la racine du dépôt (contexte de build = ..)
COPY app ./app

# L'API ne tourne pas en root
USER 10001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
