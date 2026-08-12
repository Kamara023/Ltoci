"""Environnement de test partagé — charge le .env racine avant les imports
applicatifs, avec valeurs de repli pour la CI (échec rapide garanti par
connect_timeout)."""

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
os.environ.setdefault("INGESTION_SERVICE_TOKEN", "token-de-test-123456")
