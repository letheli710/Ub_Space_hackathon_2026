"""Request-scoped browser connections; never persist or borrow server credentials."""
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from .contracts import Contract, SystemId
from .settings import AISettings, RoleSettings

DEFAULT_URLS = {
    'deepseek': 'https://api.deepseek.com',
    'openai': 'https://api.openai.com/v1',
    'anthropic': 'https://api.anthropic.com',
    'google': 'https://generativelanguage.googleapis.com',
}


class BrowserConnection(Contract):
    provider: Literal['deepseek', 'openai', 'anthropic', 'google', 'other']
    api_key: SecretStr = Field(min_length=1, max_length=4096, repr=False)
    base_url: str = Field(default='', max_length=2048)
    model: str = Field(min_length=1, max_length=200, pattern=r'^[A-Za-z0-9][A-Za-z0-9._:/-]*$')

    @field_validator('api_key')
    @classmethod
    def key_is_usable(cls, value):
        key = value.get_secret_value()
        if not key.strip() or any(ord(c) < 33 or ord(c) > 126 for c in key):
            raise ValueError('API key must contain printable characters without whitespace')
        return value

    @model_validator(mode='after')
    def endpoint(self):
        self.base_url = self.base_url.strip().rstrip('/') or DEFAULT_URLS.get(self.provider, '')
        url = urlsplit(self.base_url)
        local = url.hostname in {'localhost', '127.0.0.1', '::1'}
        if (not url.hostname or url.scheme not in {'http', 'https'} or
                (url.scheme == 'http' and not local) or url.username or url.password or
                url.query or url.fragment or any(c.isspace() for c in self.base_url)):
            raise ValueError('Use an HTTPS API base URL (HTTP is allowed only for localhost), without credentials, query or fragment')
        # Validate malformed ports here instead of allowing an HTTP client error later.
        _ = url.port
        if self.base_url.endswith(('/chat/completions', '/messages', ':generateContent')):
            raise ValueError('Enter the API base URL, not a completion endpoint')
        if self.provider == 'openai' and url.hostname == 'api.openai.com' and not url.path:
            self.base_url += '/v1'
        return self

    def settings(self):
        return AISettings(enabled=True, base_url=self.base_url, provider=self.provider,
            roles={role: RoleSettings(model=self.model, api_key=self.api_key.get_secret_value(),
                thinking=self.provider == 'deepseek' and role == SystemId.MAIN_JUDGING)
                for role in SystemId})
