from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth import require_admin
from app.config import AuthKeyConfig, ChatAccountConfig, mask_secret
from app.models import (
    AdminAccountCreate,
    AdminAccountPublic,
    AdminAccountUpdate,
    AdminAuthKeyCreate,
    AdminAuthKeyPublic,
    AdminAuthKeyUpdate,
    AdminCookieCheckResponse,
    Identity,
)
from app.services.chat.upstream_adapter import UpstreamChatAdapter
from app.services.config_store import (
    ConfigStore,
    find_account,
    find_auth_key,
    has_other_admin_key,
)


router = APIRouter(prefix="/api/admin", tags=["Admin"])


def config_store(request: Request) -> ConfigStore:
    return request.app.state.config_store


def upstream_adapter(request: Request) -> UpstreamChatAdapter:
    return request.app.state.upstream_chat_adapter


def public_auth_key(auth_key: AuthKeyConfig) -> AdminAuthKeyPublic:
    return AdminAuthKeyPublic(
        id=auth_key.id,
        role=auth_key.role,
        key_masked=mask_secret(auth_key.key),
    )


def public_account(account: ChatAccountConfig) -> AdminAccountPublic:
    return AdminAccountPublic(
        id=account.id,
        name=account.name,
        enabled=account.enabled,
        secure_1psid_masked=mask_secret(account.secure_1psid),
        secure_1psidts_masked=mask_secret(account.secure_1psidts),
        proxy=account.proxy,
        metadata=account.metadata,
    )


@router.get("/auth-keys", response_model=list[AdminAuthKeyPublic])
async def list_auth_keys(
    identity: Identity = Depends(require_admin),
    store: ConfigStore = Depends(config_store),
) -> list[AdminAuthKeyPublic]:
    config = store.read()
    return [public_auth_key(item) for item in config.auth.keys]


@router.post("/auth-keys", response_model=AdminAuthKeyPublic, status_code=status.HTTP_201_CREATED)
async def create_auth_key(
    payload: AdminAuthKeyCreate,
    identity: Identity = Depends(require_admin),
    store: ConfigStore = Depends(config_store),
) -> AdminAuthKeyPublic:
    key_id = payload.id.strip()
    key_value = payload.key.strip()
    if not key_id or not key_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Key id and key are required.")

    def mutate(config):
        if find_auth_key(config, key_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Auth key id already exists.")
        config.auth.keys.append(AuthKeyConfig(id=key_id, key=key_value, role=payload.role))

    config = store.update(mutate)
    created = find_auth_key(config, key_id)
    return public_auth_key(created)


@router.patch("/auth-keys/{key_id}", response_model=AdminAuthKeyPublic)
async def update_auth_key(
    key_id: str,
    payload: AdminAuthKeyUpdate,
    identity: Identity = Depends(require_admin),
    store: ConfigStore = Depends(config_store),
) -> AdminAuthKeyPublic:
    new_key = payload.key.strip() if payload.key is not None else None

    def mutate(config):
        auth_key = find_auth_key(config, key_id)
        if not auth_key:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auth key not found.")
        if payload.role and auth_key.role == "admin" and payload.role != "admin" and not has_other_admin_key(config, key_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the last admin key.")
        if new_key:
            auth_key.key = new_key
        if payload.role:
            auth_key.role = payload.role

    config = store.update(mutate)
    updated = find_auth_key(config, key_id)
    return public_auth_key(updated)


@router.delete("/auth-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_auth_key(
    key_id: str,
    identity: Identity = Depends(require_admin),
    store: ConfigStore = Depends(config_store),
) -> None:
    def mutate(config):
        auth_key = find_auth_key(config, key_id)
        if not auth_key:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auth key not found.")
        if auth_key.role == "admin" and not has_other_admin_key(config, key_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the last admin key.")
        config.auth.keys = [item for item in config.auth.keys if item.id != key_id]

    store.update(mutate)


@router.get("/accounts", response_model=list[AdminAccountPublic])
async def list_accounts(
    identity: Identity = Depends(require_admin),
    store: ConfigStore = Depends(config_store),
) -> list[AdminAccountPublic]:
    config = store.read()
    return [public_account(item) for item in config.chat.accounts]


@router.post("/accounts", response_model=AdminAccountPublic, status_code=status.HTTP_201_CREATED)
async def create_account(
    payload: AdminAccountCreate,
    identity: Identity = Depends(require_admin),
    store: ConfigStore = Depends(config_store),
) -> AdminAccountPublic:
    account_id = (payload.id or f"account-{uuid4().hex[:8]}").strip()
    if not account_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account id is required.")

    def mutate(config):
        if find_account(config, account_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Account id already exists.")
        config.chat.accounts.append(
            ChatAccountConfig(
                id=account_id,
                name=payload.name.strip(),
                enabled=payload.enabled,
                secure_1psid=payload.secure_1psid.strip(),
                secure_1psidts=payload.secure_1psidts.strip(),
                proxy=payload.proxy.strip(),
                metadata=payload.metadata,
            )
        )

    config = store.update(mutate)
    created = find_account(config, account_id)
    return public_account(created)


@router.patch("/accounts/{account_id}", response_model=AdminAccountPublic)
async def update_account(
    account_id: str,
    payload: AdminAccountUpdate,
    identity: Identity = Depends(require_admin),
    store: ConfigStore = Depends(config_store),
) -> AdminAccountPublic:
    def mutate(config):
        account = find_account(config, account_id)
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
        if payload.name is not None and payload.name.strip():
            account.name = payload.name.strip()
        if payload.enabled is not None:
            account.enabled = payload.enabled
        if payload.secure_1psid is not None and payload.secure_1psid.strip():
            account.secure_1psid = payload.secure_1psid.strip()
        if payload.secure_1psidts is not None and payload.secure_1psidts.strip():
            account.secure_1psidts = payload.secure_1psidts.strip()
        if payload.proxy is not None:
            account.proxy = payload.proxy.strip()
        if payload.metadata is not None:
            account.metadata = payload.metadata

    config = store.update(mutate)
    updated = find_account(config, account_id)
    return public_account(updated)


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: str,
    identity: Identity = Depends(require_admin),
    store: ConfigStore = Depends(config_store),
) -> None:
    def mutate(config):
        account = find_account(config, account_id)
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
        config.chat.accounts = [item for item in config.chat.accounts if item.id != account_id]

    store.update(mutate)


@router.post("/accounts/{account_id}/check", response_model=AdminCookieCheckResponse)
async def check_account(
    account_id: str,
    identity: Identity = Depends(require_admin),
    store: ConfigStore = Depends(config_store),
    upstream: UpstreamChatAdapter = Depends(upstream_adapter),
) -> AdminCookieCheckResponse:
    config = store.read()
    account = find_account(config, account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")

    checked_at = datetime.now(timezone.utc).isoformat()
    try:
        message = await upstream.check_account(account)
        ok = True
        check_status = "alive"
    except Exception as exc:
        message = str(exc) or "Cookie check failed."
        ok = False
        check_status = "dead"

    def mutate(next_config):
        next_account = find_account(next_config, account_id)
        if next_account:
            next_account.metadata = {
                **next_account.metadata,
                "last_checked_at": checked_at,
                "last_check_ok": ok,
                "last_check_message": message,
            }

    store.update(mutate)
    return AdminCookieCheckResponse(
        ok=ok,
        status=check_status,
        checked_at=checked_at,
        message=message,
    )
