"""Lecture de la télémétrie via l'API, sans connexion directe à PostgreSQL."""

import json
import os
import ssl
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

import pandas as pd


def normalize_telemetry(records, allow_empty=False):
    """Normalise les noms du contrat API ; ne supprime ni n'impute les mesures."""
    if records == [] and allow_empty:
        return pd.DataFrame(columns=["timestamp", "device_id", "temperature", "humidity", "gas"])
    if not isinstance(records, list) or not records or not all(isinstance(r, dict) for r in records):
        raise ValueError("L'API doit renvoyer une liste JSON non vide de mesures")
    data = pd.DataFrame(records)
    for target, aliases in {"timestamp": ("ts",), "device_id": ("dev",),
                            "temperature": ("t",), "humidity": ("h",)}.items():
        if target not in data:
            for alias in aliases:
                if alias in data:
                    data = data.rename(columns={alias: target})
                    break
    required = ["timestamp", "device_id", "temperature", "humidity", "gas"]
    if set(required) - set(data):
        raise ValueError(f"Champs API absents : {sorted(set(required) - set(data))}")
    # Le contrat accepte ISO UTC ou secondes Unix, jamais une unité devinée en ms.
    values = data["timestamp"]
    if pd.api.types.is_numeric_dtype(values):
        data["timestamp"] = pd.to_datetime(values, unit="s", utc=True, errors="coerce")
    else:
        data["timestamp"] = pd.to_datetime(values, utc=True, errors="coerce")
    for sensor in ("temperature", "humidity", "gas"):
        data[sensor] = pd.to_numeric(data[sensor], errors="coerce")
    return data


def fetch_telemetry(base_url, start, end, device=None, endpoint="/api/v1/telemetry", allow_empty=False):
    if urlsplit(base_url).scheme not in ("http", "https"):
        raise ValueError("L'adresse API doit commencer par http:// ou https://")
    query = {"from": start, "to": end}
    if device:
        query["dev"] = device
    headers = {"Accept": "application/json"}
    token = os.environ.get("SENTINEL_API_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    api_key = os.environ.get("SENTINEL_API_KEY")
    if api_key:
        headers["X-API-Key"] = api_key
    url = base_url.rstrip("/") + "/" + endpoint.lstrip("/") + "?" + urlencode(query)
    context = ssl.create_default_context(cafile=os.environ.get("SENTINEL_CA_FILE") or None)
    try:
        with urlopen(Request(url, headers=headers), timeout=30, context=context) as response:
            if response.headers.get("Link"):
                raise ValueError("Réponse potentiellement paginée : adapter le client au contrat de pagination")
            payload = json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f"API télémétrie : HTTP {exc.code}. Vérifier route et authentification.") from None
    except URLError:
        raise RuntimeError("API injoignable : vérifier adresse, réseau et certificat TLS") from None
    # Refuser les enveloppes inconnues évite d'ignorer une pagination silencieusement.
    return normalize_telemetry(payload, allow_empty=allow_empty)
