"""Connexion au dashboard : session signée dans un cookie HttpOnly, vérifiée par Caddy (forward_auth).

Configuration (docker-compose.override.yml, hors Git) :
  DASHBOARD_USER       identifiant, par défaut « sentinel »
  DASHBOARD_PASS_HASH  empreinte du mot de passe : python -m app.auth "le mot de passe"
  SESSION_SECRET       clé de signature des sessions (au moins 32 caractères aléatoires)
  COOKIE_SECURE        « 1 » une fois le dashboard servi en HTTPS

Routes : POST /api/v1/auth/login, POST /api/v1/auth/logout, GET /api/v1/auth/check, GET /api/v1/auth/me.
Seule la bibliothèque standard est utilisée (PBKDF2-SHA256, HMAC-SHA256).
"""
import base64
import hashlib
import hmac
import os
import secrets
import sys
import threading
import time

from fastapi import Request, Response
from pydantic import BaseModel, Field

USER = os.getenv("DASHBOARD_USER", "sentinel")
PASS_HASH = os.getenv("DASHBOARD_PASS_HASH", "")
SECRET = os.getenv("SESSION_SECRET", "")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "0") == "1"
COOKIE = "sx_session"
SESSION_S = 8 * 3600              # une journée de travail
ITERATIONS = 310_000              # recommandation OWASP pour PBKDF2-SHA256
MAX_FAILS, FAIL_WINDOW_S = 5, 300  # au-delà de 5 échecs en 5 min, l'adresse IP attend

_fails: dict[str, list[float]] = {}
_lock = threading.Lock()


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256:{ITERATIONS}:{base64.b64encode(salt).decode()}:{base64.b64encode(dk).decode()}"


def _check_password(password: str) -> bool:
    try:
        algo, iters, salt, digest = PASS_HASH.split(":")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(iters))
        return hmac.compare_digest(dk, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


def _sign(payload: str) -> str:
    return hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _make_session(user: str) -> str:
    payload = f"{user}|{int(time.time()) + SESSION_S}"
    return base64.urlsafe_b64encode(payload.encode()).decode() + "." + _sign(payload)


def session_user(request: Request) -> str | None:
    """Utilisateur de la session si le cookie est valide et non expiré, sinon None."""
    raw = request.cookies.get(COOKIE, "")
    if not (SECRET and "." in raw):
        return None
    b64, sig = raw.rsplit(".", 1)
    try:
        payload = base64.urlsafe_b64decode(b64.encode()).decode()
        user, exp = payload.split("|")
    except (ValueError, UnicodeDecodeError):
        return None
    if not hmac.compare_digest(sig, _sign(payload)) or int(exp) < time.time():
        return None
    return user


def _client_ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()


def _too_many(ip: str) -> bool:
    now = time.time()
    with _lock:
        recent = [t for t in _fails.get(ip, []) if now - t < FAIL_WINDOW_S]
        _fails[ip] = recent
        return len(recent) >= MAX_FAILS


def _record_fail(ip: str) -> None:
    with _lock:
        _fails.setdefault(ip, []).append(time.time())


class Credentials(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)


def setup(app) -> None:
    @app.post("/api/v1/auth/login")
    def login(creds: Credentials, request: Request, response: Response):
        ip = _client_ip(request)
        if not (SECRET and PASS_HASH):
            response.status_code = 503
            return {"error": "Connexion non configurée sur le serveur"}
        if _too_many(ip):
            response.status_code = 429
            return {"error": "Trop d'essais. Réessayez dans quelques minutes."}
        user_ok = hmac.compare_digest(creds.username.encode(), USER.encode())
        pass_ok = _check_password(creds.password)     # toujours calculé : même durée quel que soit l'identifiant
        if not (user_ok and pass_ok):
            _record_fail(ip)
            time.sleep(1)                     # ralentit les essais en série
            response.status_code = 401
            return {"error": "Identifiant ou mot de passe incorrect"}
        response.set_cookie(COOKIE, _make_session(USER), max_age=SESSION_S, httponly=True,
                            secure=COOKIE_SECURE, samesite="strict", path="/")
        return {"user": USER}

    @app.post("/api/v1/auth/logout", status_code=204)
    def logout(response: Response):
        response.delete_cookie(COOKIE, path="/")

    @app.get("/api/v1/auth/check")
    def check(request: Request):
        """Appelée par Caddy avant chaque requête (forward_auth) : 204 si la session est valide."""
        return Response(status_code=204 if session_user(request) else 401)

    @app.get("/api/v1/auth/me")
    def me(request: Request, response: Response):
        user = session_user(request)
        if not user:
            response.status_code = 401
            return {"error": "Non connecté"}
        return {"user": user}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('Usage : python -m app.auth "mot de passe"   (affiche DASHBOARD_PASS_HASH)')
    print(hash_password(sys.argv[1]))
