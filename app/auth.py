import secrets

from fastapi import Depends, Header, HTTPException, status

from app.config import load_config
from app.models import Identity


async def require_identity(authorization: str | None = Header(default=None)) -> Identity:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )

    token = authorization.removeprefix("Bearer ").strip()
    config = load_config()
    for auth_key in config.auth.keys:
        if secrets.compare_digest(token, auth_key.key):
            return Identity(id=auth_key.id, role=auth_key.role)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid bearer token.",
    )


async def require_admin(identity: Identity = Depends(require_identity)) -> Identity:
    if identity.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required.",
        )
    return identity
