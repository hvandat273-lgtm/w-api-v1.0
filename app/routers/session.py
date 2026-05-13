from fastapi import APIRouter, Depends

from app.auth import require_identity
from app.models import Identity, MeResponse


router = APIRouter(prefix="/api", tags=["Session"])


@router.get("/me", response_model=MeResponse)
async def me(identity: Identity = Depends(require_identity)) -> MeResponse:
    return MeResponse(id=identity.id, role=identity.role)
