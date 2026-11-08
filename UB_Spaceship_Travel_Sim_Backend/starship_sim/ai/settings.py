"""Server-side DeepSeek connection settings. Secret values never enter status."""

from dataclasses import dataclass, field
import os
from urllib.parse import urlsplit

from .contracts import SystemId


def enabled(value):
    return str(value).lower() in {'1', 'true', 'yes'}


@dataclass(frozen=True)
class RoleSettings:
    model: str
    api_key: str = field(repr=False)
    thinking: bool = False
    max_tokens: int = 4096


@dataclass(frozen=True)
class AISettings:
    enabled: bool
    base_url: str
    roles: dict[SystemId, RoleSettings]
    timeout_s: float = 45
    max_cycle_age_s: float = 120
    loop_interval_s: float = 10


def load_settings(environ=None):
    env = os.environ if environ is None else environ
    base = env.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com').rstrip('/')
    url = urlsplit(base)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError('DEEPSEEK_BASE_URL must be an HTTPS API base URL without embedded credentials')
    roles = {}
    for role in SystemId:
        prefix = f'AI_{role.value.upper()}'
        roles[role] = RoleSettings(
            model=env.get(prefix + '_MODEL') or env.get('DEEPSEEK_MODEL', 'deepseek-flash'),
            api_key=env.get(prefix + '_API_KEY') or env.get('DEEPSEEK_API_KEY', ''),
            thinking=enabled(env.get(prefix + '_THINKING', 'true' if role == SystemId.MAIN_JUDGING else 'false')),
            max_tokens=int(env.get(prefix + '_MAX_TOKENS', '4096')),
        )
        if not 256 <= roles[role].max_tokens <= 16384:
            raise ValueError('AI output token limit must be between 256 and 16384')
    settings = AISettings(enabled(env.get('AI_ENABLED', 'false')), base, roles,
        timeout_s=float(env.get('AI_REQUEST_TIMEOUT_S', '45')),
        max_cycle_age_s=float(env.get('AI_MAX_CYCLE_AGE_S', '120')),
        loop_interval_s=float(env.get('AI_LOOP_INTERVAL_S', '10')))
    if not 1 <= settings.timeout_s <= 120 or not 1 <= settings.max_cycle_age_s <= 300 or not 2 <= settings.loop_interval_s <= 300:
        raise ValueError('AI timeout, cycle age or loop interval is outside supported bounds')
    return settings
