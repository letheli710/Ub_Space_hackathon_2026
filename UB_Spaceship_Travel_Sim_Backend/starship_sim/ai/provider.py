"""DeepSeek Chat Completions adapter, isolated from orchestration and actuators."""

import json
import httpx


class ModelError(RuntimeError):
    pass


class DeepSeekClient:
    def __init__(self, settings, client=None):
        self.settings = settings
        self.client = client or httpx.AsyncClient(timeout=settings.timeout_s)
        self.owns_client = client is None

    async def complete(self, role, prompt, context, output_type):
        config = self.settings.roles[role]
        if not config.api_key:
            raise ModelError(f'DeepSeek API key is not configured for {role}')
        body = {'model': config.model,
                'messages': [{'role': 'system', 'content': prompt},
                             {'role': 'user', 'content': json.dumps(context, allow_nan=False)}],
                'response_format': {'type': 'json_object'}, 'max_tokens': config.max_tokens,
                'thinking': {'type': 'enabled' if config.thinking else 'disabled'}}
        if config.thinking:
            body['reasoning_effort'] = 'high' if role == 'main_judging' else 'low'
        try:
            response = await self.client.post(self.settings.base_url + '/chat/completions', json=body,
                headers={'Authorization': f'Bearer {config.api_key}'}, timeout=self.settings.timeout_s)
        except httpx.TimeoutException as exc:
            raise ModelError('DeepSeek request timed out; no action was authorized') from exc
        except httpx.HTTPError as exc:
            raise ModelError('DeepSeek connection failed') from exc
        if response.status_code != 200:
            # Do not expose provider error bodies: some providers echo credentials.
            raise ModelError(f'DeepSeek returned HTTP {response.status_code}')
        try:
            data = response.json()
            choice = data['choices'][0]
            text = choice['message']['content']
            if choice.get('finish_reason') != 'stop' or not isinstance(text, str) or not text.strip() or len(text) > 100000:
                raise ValueError('Blank, truncated or oversized output')
            result = output_type.model_validate_json(text)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise ModelError('DeepSeek returned invalid structured output; no action was authorized') from exc
        # reasoning_content is deliberately neither returned nor persisted.
        return result

    async def close(self):
        if self.owns_client:
            await self.client.aclose()
