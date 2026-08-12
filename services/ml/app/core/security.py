"""Authentification interne : le service ML n'est jamais exposé publiquement ;
chaque requête doit porter le token de service partagé avec l'API Node."""

import hmac

from fastapi import Header, HTTPException, status

from app.core.settings import get_settings


def require_service_token(x_internal_token: str = Header(default="")) -> None:
    expected = get_settings().ml_service_token
    if not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de service interne manquant ou invalide",
        )
