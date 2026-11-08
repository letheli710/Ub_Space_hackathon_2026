// AI provider settings entered on the AI API tab.
// The key stays in this browser only. By default it lives in sessionStorage (cleared when
// the tab closes); "Remember on this device" moves it to localStorage. Nothing here sends
// the key anywhere. For production, the backend should hold the key instead.

const STORAGE_KEY = 'interstellar-x4.ai-settings';

export const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', prefix: 'sk-ant-' },
  { id: 'openai', label: 'OpenAI', prefix: 'sk-' },
  { id: 'google', label: 'Google Gemini', prefix: 'AIza' },
  { id: 'other', label: 'Other', prefix: '' },
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
  } catch {
    /* storage unavailable: nothing to remove */
  }
}

/** Saved settings, or null. Shape: { provider, apiKey, remember }. */
export function loadAiSettings() {
  const remembered = read(globalThis.localStorage);
  if (remembered?.apiKey) return { ...remembered, remember: true };
  const session = read(globalThis.sessionStorage);
  if (session?.apiKey) return { ...session, remember: false };
  return null;
}

/** Save to sessionStorage, or localStorage when remember is true. Returns false if storage is blocked. */
export function saveAiSettings({ provider, apiKey, remember }) {
  clearAiSettings();
  try {
    const storage = remember ? globalThis.localStorage : globalThis.sessionStorage;
    storage.setItem(STORAGE_KEY, JSON.stringify({ provider, apiKey }));
    return true;
  } catch {
    return false;
  }
}

export function clearAiSettings() {
  remove(globalThis.localStorage);
  remove(globalThis.sessionStorage);
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
