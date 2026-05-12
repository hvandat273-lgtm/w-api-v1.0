from app.config import ChatAccountConfig, load_config, mask_secret


class ChatAccountService:
    def __init__(self) -> None:
        self._next_index = 0

    def select_account(self) -> ChatAccountConfig:
        config = load_config()
        if not config.chat.enabled:
            raise RuntimeError("Chat is disabled.")

        enabled_accounts = [
            account
            for account in config.chat.accounts
            if account.enabled and account.secure_1psid
        ]
        if not enabled_accounts:
            raise RuntimeError("No enabled backend chat account is configured.")

        account = enabled_accounts[self._next_index % len(enabled_accounts)]
        self._next_index = (self._next_index + 1) % len(enabled_accounts)
        return account

    @staticmethod
    def public_account(account: ChatAccountConfig) -> dict[str, object]:
        return {
            "id": account.id,
            "name": account.name,
            "enabled": account.enabled,
            "secure_1psid": mask_secret(account.secure_1psid),
            "secure_1psidts": mask_secret(account.secure_1psidts),
            "has_proxy": bool(account.proxy),
        }
