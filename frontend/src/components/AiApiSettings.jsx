import { Eye, EyeOff, KeyRound, Link, ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  PROVIDERS,
  baseUrlError,
  clearAiSettings,
  defaultBaseUrl,
  keyFormatHint,
  loadAiSettings,
  maskKey,
  saveAiSettings,
} from '../ai/settings.js';

/** AI API tab: users enter the API key the AI features will use. */
export default function AiApiSettings() {
  const [saved, setSaved] = useState(loadAiSettings);
  const [provider, setProvider] = useState(saved?.provider ?? PROVIDERS[0].id);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? '');
  const [remember, setRemember] = useState(saved?.remember ?? false);
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState('');

  const trimmed = apiKey.trim();
  const hint = keyFormatHint(provider, trimmed);
  const link = baseUrl.trim().replace(/\/+$/, '');
  const linkError = baseUrlError(link);
  // A new link can be saved on its own while a key is already stored.
  const keyToSave = trimmed || saved?.apiKey || '';
  const changed = trimmed || link !== (saved?.baseUrl ?? '') || provider !== saved?.provider;
  const canSave = Boolean(keyToSave) && !linkError && Boolean(changed);
  const savedProvider = PROVIDERS.find((item) => item.id === saved?.provider);

  function save(event) {
    event.preventDefault();
    if (!canSave) return;
    const next = { provider, apiKey: keyToSave, baseUrl: link, remember };
    if (!saveAiSettings(next)) {
      setMessage('This browser blocked storage, so the key could not be saved.');
      return;
    }
    setSaved(next);
    setApiKey('');
    setBaseUrl(link);
    setShowKey(false);
    setMessage(remember ? 'Settings saved on this device.' : 'Settings saved for this browser tab.');
  }

  function clear() {
    clearAiSettings();
    setSaved(null);
    setBaseUrl('');
    setMessage('Key and API link removed from this browser.');
  }

  return (
    <section className="ai-api">
      <form className="panel ai-api-card" onSubmit={save}>
        <div className="panelhead">
          <KeyRound size={18} /> AI API
        </div>

        <div className="ai-api-body">
          <p className="muted">
            Optional browser-only provider settings. Live spacecraft AI uses the backend .env configuration
            and runs from AI Logs. Saving a key here does not change that connection.
          </p>

          <div className={`ai-api-status ${saved ? 'set' : ''}`} role="status">
            {saved ? (
              <>
                <span>
                  <b>{savedProvider?.label ?? saved.provider}</b> key {maskKey(saved.apiKey)}
                </span>
                <small>
                  {saved.baseUrl || `${defaultBaseUrl(saved.provider) || 'No API link'} (default)`}
                </small>
                <small>{saved.remember ? 'Remembered on this device' : 'Saved for this browser tab'}</small>
              </>
            ) : (
              <span>No API key saved</span>
            )}
          </div>

          <label htmlFor="ai-provider">Provider</label>
          <select id="ai-provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>

          <label htmlFor="ai-url">API link</label>
          <div className="ai-api-key">
            <span className="ai-api-icon" aria-hidden="true">
              <Link size={15} />
            </span>
            <input
              id="ai-url"
              type="url"
              inputMode="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={defaultBaseUrl(provider) || 'https://your-api.example.com/v1'}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(linkError)}
              aria-describedby="ai-url-help"
            />
          </div>
          <p id="ai-url-help" className={linkError ? 'ai-api-hint' : 'muted ai-api-help'}>
            {linkError || 'Leave empty to use the provider\'s standard address, or paste a proxy or self-hosted endpoint.'}
          </p>

          <label htmlFor="ai-key">{saved ? 'Replace API key' : 'API key'}</label>
          <div className="ai-api-key">
            <input
              id="ai-key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              title={showKey ? 'Hide' : 'Show'}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {hint && <p className="ai-api-hint">{hint}</p>}

          <label className="ai-api-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember on this device
          </label>

          <div className="ai-api-actions">
            <button type="submit" className="primary" disabled={!canSave}>
              Save
            </button>
            <button type="button" onClick={clear} disabled={!saved}>
              <Trash2 size={15} /> Remove
            </button>
          </div>
          {message && <p className="muted ai-api-message">{message}</p>}

          <div className="ai-api-note">
            <ShieldAlert size={16} />
            <p>
              The key stays in this browser and is not sent anywhere yet. Anyone using this browser can read
              it, so only use your own key on a computer you trust. For a shared or public deployment, keep the
              key on the backend instead.
            </p>
          </div>
        </div>
      </form>
    </section>
  );
}
