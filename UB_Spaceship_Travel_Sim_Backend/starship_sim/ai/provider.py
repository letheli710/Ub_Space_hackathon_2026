"""Provider protocols, isolated from orchestration and actuators."""

import asyncio
import json
from urllib.parse import quote
import httpx


class ModelError(RuntimeError):
    pass


class ModelClient:
    def __init__(self, settings, client=None):
        self.settings = settings
        self.client = client or httpx.AsyncClient(timeout=settings.timeout_s, follow_redirects=False)
        self.owns_client = client is None

    @property
    def label(self):
        return {'deepseek': 'DeepSeek', 'openai': 'OpenAI', 'anthropic': 'Anthropic',
                'google': 'Gemini', 'other': 'Custom provider'}[self.settings.provider]

    def root(self):
        base = self.settings.base_url.rstrip('/')
        if self.settings.provider == 'anthropic' and not base.endswith('/v1'):
            base += '/v1'
        if self.settings.provider == 'google' and not base.endswith(('/v1', '/v1beta')):
            base += '/v1beta'
        return base

    def headers(self, config):
        if not config.api_key:
            raise ModelError(f'{self.label} API key is not configured')
        if self.settings.provider == 'anthropic':
            return {'x-api-key': config.api_key, 'anthropic-version': '2023-06-01'}
        if self.settings.provider == 'google':
            return {'x-goog-api-key': config.api_key}
        return {'Authorization': f'Bearer {config.api_key}'}

    async def send(self, method, path, config, body=None):
        try:
            response = await self.client.request(method, self.root() + path,
                **({'json': body} if body is not None else {}),
                headers=self.headers(config), timeout=self.settings.timeout_s, follow_redirects=False)
        except httpx.TimeoutException as exc:
            raise ModelError(f'{self.label} request timed out; no action was authorized') from exc
        except httpx.HTTPError as exc:
            raise ModelError(f'{self.label} connection failed') from exc
        if response.status_code != 200:
            # Never expose provider bodies, URLs with keys, or request headers.
            raise ModelError(f'{self.label} returned HTTP {response.status_code}')
        try:
            return response.json()
        except ValueError as exc:
            raise ModelError(f'{self.label} returned invalid JSON') from exc

    async def check(self):
        """Check model access without generating tokens or issuing actuator commands."""
        configs = {(c.api_key, c.model): c for c in self.settings.roles.values()}

        async def one(config):
            model = config.model.removeprefix('models/') if self.settings.provider == 'google' else config.model
            if self.settings.provider in {'deepseek', 'other'}:
                data = await self.send('GET', '/models', config)
                entries = data.get('data') if isinstance(data, dict) else None
                available = isinstance(entries, list) and any(m.get('id') == model for m in entries if isinstance(m, dict))
            else:
                data = await self.send('GET', '/models/' + quote(model, safe=''), config)
                available = isinstance(data, dict) and bool(data.get('id') or data.get('name'))
            if not available:
                raise ModelError(f'{self.label}: selected model was not found; check the model ID')

        await asyncio.gather(*(one(c) for c in configs.values()))

    async def complete(self, role, prompt, context, output_type):
        config = self.settings.roles[role]
        provider = self.settings.provider
        content = json.dumps(context, allow_nan=False)
        body = {'model': config.model,
                'messages': [{'role': 'system', 'content': prompt},
                             {'role': 'user', 'content': content}],
                'response_format': {'type': 'json_object'}}
        path = '/chat/completions'
        if provider == 'anthropic':
            path = '/messages'
            body = {'model': config.model, 'system': prompt,
                    'messages': [{'role': 'user', 'content': content}], 'max_tokens': config.max_tokens}
        elif provider == 'google':
            path = '/models/' + quote(config.model.removeprefix('models/'), safe='') + ':generateContent'
            body = {'systemInstruction': {'parts': [{'text': prompt}]},
                    'contents': [{'role': 'user', 'parts': [{'text': content}]}],
                    'generationConfig': {'responseMimeType': 'application/json', 'maxOutputTokens': config.max_tokens}}
        else:
            body['max_completion_tokens' if provider == 'openai' else 'max_tokens'] = config.max_tokens
            if provider == 'deepseek':
                body['thinking'] = {'type': 'enabled' if config.thinking else 'disabled'}
                if config.thinking:
                    body['reasoning_effort'] = 'high' if role == 'main_judging' else 'low'
        data = await self.send('POST', path, config, body)
        try:
            if provider == 'anthropic':
                finished = data.get('stop_reason') == 'end_turn'
                text = ''.join(b['text'] for b in data['content'] if b.get('type') == 'text')
            elif provider == 'google':
                choice = data['candidates'][0]
                finished = choice.get('finishReason') == 'STOP'
                text = ''.join(p.get('text', '') for p in choice['content']['parts'] if not p.get('thought'))
            else:
                choice = data['choices'][0]
                finished = choice.get('finish_reason') == 'stop'
                text = choice['message']['content']
            if not finished or not isinstance(text, str) or not text.strip() or len(text) > 100000:
                raise ValueError('Blank, truncated or oversized output')
            result = output_type.model_validate_json(text)
        except (KeyError, IndexError, TypeError, ValueError, AttributeError) as exc:
            raise ModelError(f'{self.label} returned invalid structured output; no action was authorized') from exc
        # reasoning_content is deliberately neither returned nor persisted.
        return result

    async def close(self):
        if self.owns_client:
            await self.client.aclose()


# Preserve the existing native/Gazebo import and its default DeepSeek behavior.
DeepSeekClient = ModelClient
