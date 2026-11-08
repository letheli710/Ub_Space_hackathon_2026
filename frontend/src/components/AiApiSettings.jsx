import { Eye, EyeOff, KeyRound, Link, ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  PROVIDERS,
  baseUrlError,
  clearAiSettings,
  defaultBaseUrl,
  defaultModel,
  modelConnection,
  keyFormatHint,
  loadAiSettings,
  maskKey,
  saveAiSettings,
} from '../ai/settings.js';

/** AI API tab: users enter the API key the AI features will use. */
export default function AiApiSettings({ ai, onSettingsChange, onOpenControls }) {
  const [saved, setSaved] = useState(loadAiSettings);
  const [provider, setProvider] = useState(saved?.provider ?? 'deepseek');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? '');
  const [model, setModel] = useState(saved?.model ?? defaultModel(provider));
  const [remember, setRemember] = useState(saved?.remember ?? false);
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState('');

  const trimmed = apiKey.trim();
  const hint = keyFormatHint(provider, trimmed);
  const link = baseUrl.trim().replace(/\/+$/, '');
  const linkError = baseUrlError(link);
  // A new link can be saved on its own while a key is already stored.
  const keyToSave = trimmed || (provider === saved?.provider ? saved.apiKey : '') || '';
  const changed = trimmed || link !== (saved?.baseUrl ?? '') || provider !== saved?.provider || model.trim() !== saved?.model || remember !== saved?.remember;
  const canSave = Boolean(keyToSave && model.trim()) && !linkError && Boolean(changed);
  const savedProvider = PROVIDERS.find((item) => item.id === saved?.provider);

  function save(event) {
    event.preventDefault();
    if (!canSave) return;
    const next = { provider, apiKey: keyToSave, baseUrl: link, model: model.trim(), remember };
    try { modelConnection(next); } catch (error) { setMessage(error.message); return; }
    if (!saveAiSettings(next)) {
      setMessage('This browser blocked storage, so the key could not be saved.');
      return;
    }
    setSaved(next);
    onSettingsChange(next);
    setApiKey('');
    setBaseUrl(link);
    setShowKey(false);
    setMessage(remember ? 'Settings saved on this device.' : 'Settings saved for this browser tab.');
  }

  function clear() {
    if (!clearAiSettings()) { setMessage('Browser storage blocked removal. Clear this site’s stored data in browser settings.'); return; }
    setSaved(null);
    setApiKey('');
    setBaseUrl('');
    onSettingsChange(null);
    setMessage('Browser connection removed. DEMO AI will use the backend configuration.');
  }

  return (
    <section className="ai-api">
      <form className="panel ai-api-card" onSubmit={save}>
        <div className="panelhead">
          <KeyRound size={18} /> AI API
        </div>

        <div className="ai-api-body">
          <p className="muted">
            Connect Main Judging, Propelling, Energy and Robot Arms in DEMO. Saved settings apply
            to all four roles on the next AI cycle. With no browser connection saved, DEMO uses
            the backend .env. The optional Gazebo AI uses its separate backend configuration.
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
                <small>Model: {saved.model || 'Enter a model ID to finish setup'}</small>
              </>
            ) : (
              <span>Using backend connection · no browser override saved</span>
            )}
          </div>

          <label htmlFor="ai-provider">Provider</label>
          <select id="ai-provider" value={provider} onChange={(e) => {
            setProvider(e.target.value); setBaseUrl(''); setModel(defaultModel(e.target.value));
            setApiKey(''); setMessage('Enter a key and model for the selected provider.');
          }}>
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>

          <label htmlFor="ai-model">Model ID</label>
          <input id="ai-model" value={model} onChange={e => setModel(e.target.value)}
            placeholder="Enter a text model ID from your provider" autoComplete="off" spellCheck={false} maxLength={200} />
          <p className="muted ai-api-help">DeepSeek defaults to deepseek-flash. Other providers require a model ID available to your account. Custom providers must support OpenAI-compatible Chat Completions and JSON output.</p>

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
          <p className="muted">Saving or removing a connection stops DEMO autopilot and cancels pending decisions. Resume it from the AI controls when ready.</p>
          <div className="ai-api-actions">
            <button type="button" disabled={ai.checking || Boolean(saved && changed) || Boolean(!saved && (trimmed || link))} onClick={ai.connect}>
              {ai.checking ? 'Checking connection…' : saved ? 'Check saved connection' : 'Check backend connection'}
            </button>
            <button type="button" onClick={onOpenControls}>Open spacecraft AI controls</button>
          </div>
          {ai.service?.verified && <p role="status">{ai.service.message}</p>}
          {ai.error && <p role="alert">{ai.error}</p>}

          <div className="ai-api-note">
            <ShieldAlert size={16} />
            <p>
              Checking or running AI sends this key through your DEMO AI gateway to the selected API
              address. The gateway does not save it or change .env. “Remember” stores it on this device;
              otherwise it lasts for this browser tab. Save only keys for the endpoint you intend to use.
            </p>
          </div>
        </div>
      </form>
    </section>
  );
}
