"""Environnement de test partagé.

Charge le .env racine du monorepo (si présent) AVANT tout import applicatif,
puis pose des valeurs de repli pour que Settings() se construise même sans
base disponible (CI) — l'URL de repli échoue vite grâce au connect_timeout.
"""

import os
from pathlib import Path

_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"

if _ROOT_ENV.exists():
    for line in _ROOT_ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@127.0.0.1:1/absent")
os.environ.setdefault("ML_SERVICE_TOKEN", "token-de-test-123456")
