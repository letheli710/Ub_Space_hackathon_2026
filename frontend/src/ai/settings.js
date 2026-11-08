// AI provider settings entered on the AI API tab.
// The saved copy stays in this browser. By default it lives in sessionStorage (cleared when
// the tab closes); "Remember on this device" moves it to localStorage. DEMO requests
// send the chosen connection to the AI gateway, which calls the selected provider.

const STORAGE_KEY = 'interstellar-x4.ai-settings';

export const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', prefix: 'sk-ant-', baseUrl: 'https://api.anthropic.com' },
  { id: 'openai', label: 'OpenAI', prefix: 'sk-', baseUrl: 'https://api.openai.com/v1' },
  { id: 'deepseek', label: 'DeepSeek', prefix: 'sk-', baseUrl: 'https://api.deepseek.com' },
  { id: 'google', label: 'Google Gemini', prefix: 'AIza', baseUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'other', label: 'Other (OpenAI-compatible)', prefix: '', baseUrl: '' },
];

function read(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function remove(storage) {
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Saved settings, or null. Older DeepSeek saves inherit the existing model. */
export function loadAiSettings() {
  const remembered = read(globalThis.localStorage);
  if (remembered?.apiKey) return { ...remembered, model: remembered.model ?? defaultModel(remembered.provider), remember: true };
  const session = read(globalThis.sessionStorage);
  if (session?.apiKey) return { ...session, model: session.model ?? defaultModel(session.provider), remember: false };
  return null;
}

/** Save to sessionStorage, or localStorage when remember is true. Returns false if storage is blocked. */
export function saveAiSettings({ provider, apiKey, baseUrl = '', model = defaultModel(provider), remember }) {
  try {
    const storage = remember ? globalThis.localStorage : globalThis.sessionStorage;
    storage.setItem(STORAGE_KEY, JSON.stringify({ provider, apiKey, baseUrl, model }));
    // Do not delete a working connection before its replacement can be saved.
    if (!remove(remember ? globalThis.sessionStorage : globalThis.localStorage)) return false;
    return true;
  } catch {
    return false;
  }
}

export function clearAiSettings() {
  const local = remove(globalThis.localStorage), session = remove(globalThis.sessionStorage);
  return local && session;
}

/** Show only the last four characters of a key. */
export function maskKey(apiKey) {
  return apiKey.length > 4 ? `••••••••${apiKey.slice(-4)}` : '••••';
}

/** A hint (not a block) when the key does not look like the chosen provider's format. */
export function keyFormatHint(providerId, apiKey) {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider?.prefix || !apiKey || apiKey.startsWith(provider.prefix)) return '';
  return `${provider.label} keys usually start with "${provider.prefix}". Check that you pasted the right key.`;
}

/** The provider's standard API address, used when no link is entered. */
export function defaultBaseUrl(providerId) {
  return PROVIDERS.find((item) => item.id === providerId)?.baseUrl ?? '';
}

/** An error message when the API link is not a usable http(s) address, otherwise ''. */
export function baseUrlError(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'The API link must start with https:// or http://.';
    if (url.username || url.password) return 'Do not put a username or password in the API link.';
    if (url.search || url.hash) return 'Use a base URL without query parameters or fragments.';
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return 'Use HTTPS, or HTTP on localhost for a local proxy.';
    if (/\/(chat\/completions|messages)$|:generateContent$/.test(url.pathname)) return 'Enter the API base address, not a completion endpoint.';
    return '';
  } catch {
    return 'Enter a full address, for example https://api.example.com/v1.';
  }
}

export function defaultModel(providerId) {
  return providerId === 'deepseek' ? 'deepseek-flash' : '';
}

/** The only place browser credentials enter a gateway request; never observations. */
export function modelConnection(settings) {
  if (!settings) return null;
  const { provider, apiKey } = settings;
  if (!PROVIDERS.some(p => p.id === provider)) throw new Error('Choose a supported provider in AI API.');
  const model = (settings.model ?? defaultModel(provider)).trim();
  const baseUrl = (settings.baseUrl || defaultBaseUrl(provider)).trim().replace(/\/+$/, '');
  if (!model || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model) || model.length > 200) throw new Error('Enter a valid model ID in AI API.');
  if (!apiKey?.trim() || !/^[\x21-\x7e]+$/.test(apiKey.trim()) || apiKey.trim().length > 4096) throw new Error('Enter a valid API key in AI API.');
  if (!baseUrl || baseUrlError(baseUrl)) throw new Error(baseUrlError(baseUrl) || 'Enter the API base address.');
  return { provider, model, api_key: apiKey.trim(), base_url: baseUrl };
}
