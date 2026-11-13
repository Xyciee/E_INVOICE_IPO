import React, { useEffect, useState } from 'react';
import { PlugZap, Save, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConfirm, useNotify } from '../context/NotificationContext';
import { odooApi, errorText, fieldErrors, keyBanner, formatDateTime } from '../services/odooService';
import './pages.css';
import './odoo.css';

/*
 * Settings → Odoo connection (IT only, permission manage_odoo_settings).
 *   GET/PUT /api/odoo/settings, DELETE /api/odoo/settings/api-key, POST /api/odoo/settings/test
 * The API key is write-only: the field is always empty on load, is sent only when IT types a new one, and the
 * server never sends it back (only the last 4 characters, the expiry date and who set it).
 */

const MARK = { ok: '✔', warn: '⚠', fail: '✖' };

function formFrom(settings) {
  return {
    odoo_url: settings?.odoo_url || '',
    odoo_database: settings?.odoo_database || '',
    api_key: '',
    api_key_expires_on: settings?.api_key_expires_on || '',
    sync_start_date: settings?.sync_start_date || '2026-12-01',
    company_ids: (settings?.company_ids || []).join(', '),
    auto_sync_enabled: settings?.auto_sync_enabled ?? true,
    sync_interval_minutes: settings?.sync_interval_minutes ?? ''
  };
}

function requestBody(form) {
  const body = {
    odoo_url: form.odoo_url.trim(),
    odoo_database: form.odoo_database.trim(),
    sync_start_date: form.sync_start_date,
    // "1, 3" or "1 3": the server checks each id; empty = every company
    company_ids: form.company_ids.trim(),
    auto_sync_enabled: Boolean(form.auto_sync_enabled)
  };
  // only asked when automatic sync is on; empty = every 10 minutes
  if (form.auto_sync_enabled) {
    body.sync_interval_minutes = String(form.sync_interval_minutes ?? '').trim() === '' ? null : Number(form.sync_interval_minutes);
  }
  if (form.api_key.trim()) body.api_key = form.api_key.trim();
  if (form.api_key_expires_on) body.api_key_expires_on = form.api_key_expires_on;
  return body;
}

export default function OdooSettingsPage() {
  const { user } = useAuth();
  const notify = useNotify();
  const confirm = useConfirm();
  const allowed = (user?.permissions || []).includes('manage_odoo_settings');

  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(formFrom(null));
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [test, setTest] = useState(null);

  const show = (res) => {
    if (!res.ok) {
      setLoadError(errorText(res, 'Could not load the Odoo settings.'));
      return;
    }
    setLoadError('');
    setSettings(res.data);
    setForm(formFrom(res.data));
  };

  const load = async () => show(await odooApi.settings());

  useEffect(() => {
    if (!allowed) return undefined;
    let alive = true;
    odooApi.settings().then((res) => alive && show(res));
    return () => {
      alive = false;
    };
  }, [allowed]);

  if (!allowed) {
    return (
      <div className="card-section">
        <div className="odoo-banner odoo-banner-warn"><AlertTriangle size={18} /> The Odoo connection is set up by IT only.</div>
      </div>
    );
  }

  const set = (name) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((errs) => ({ ...errs, [name]: undefined }));
  };

  const handleTest = async () => {
    setBusy('test');
    setTest(null);
    setErrors({});
    const res = await odooApi.testConnection(requestBody(form));
    setBusy('');
    if (res.ok) {
      setTest(res.data);
      return;
    }
    setErrors(fieldErrors(res));
    setTest({ ok: false, checks: [{ check: 'request', status: 'fail', message: errorText(res, 'The test could not run.') }] });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy('save');
    setErrors({});
    const res = await odooApi.saveSettings(requestBody(form));
    setBusy('');
    if (res.ok) {
      setSettings(res.data);
      setForm(formFrom(res.data));
      notify.success('Odoo settings saved', res.data.problem || 'The next sync uses these settings.');
      return;
    }
    setErrors(fieldErrors(res));
    notify.danger('Not saved', errorText(res, 'The settings could not be saved.'));
  };

  const handleRemoveKey = async () => {
    const ok = await confirm({
      title: 'Remove the Odoo API key?',
      message: 'The Odoo sync stops until a new key is entered. The key itself stays valid in Odoo: revoke it there if it should no longer work.',
      confirmText: 'Remove key',
      cancelText: 'Keep key',
      variant: 'danger'
    });
    if (!ok) return;
    setBusy('remove');
    const res = await odooApi.removeKey();
    setBusy('');
    if (res.ok) {
      setSettings(res.data);
      setForm(formFrom(res.data));
      notify.success('API key removed', 'The Odoo sync is off until a new key is entered.');
    } else {
      notify.danger('Not removed', errorText(res));
    }
  };

  const keyPlaceholder = settings?.api_key_set
    ? `•••• ${settings.api_key_last4} — set ${settings.api_key_set_at ? formatDateTime(settings.api_key_set_at) : ''}${settings.api_key_set_by ? ` by ${settings.api_key_set_by}` : ''}`
    : 'Paste the API key made in Odoo';
  const banner = settings ? keyBanner(settings.api_key_status, settings.api_key_days_left, settings.api_key_expires_on) : null;
  const err = (name) => errors[name] && <span className="odoo-field-error">{errors[name]}</span>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Odoo Connection</h1>
          <p className="page-subtitle">
            Where the app reads posted Odoo invoices from. The app only reads Odoo; nothing is sent to Odoo.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={load} disabled={Boolean(busy)}><RefreshCw size={16} /> Reload</button>
        </div>
      </div>

      {loadError && <div className="odoo-banner odoo-banner-bad">{loadError}</div>}
      {settings && !settings.encryption_key_configured && (
        <div className="odoo-banner odoo-banner-bad">
          <AlertTriangle size={18} /> Odoo settings can't be saved: encryption key not configured (IT). Add
          ODOO_SETTINGS_ENCRYPTION_KEY to the server's .env (see the runbook).
        </div>
      )}
      {settings?.problem && settings.encryption_key_configured && (
        <div className="odoo-banner odoo-banner-warn"><AlertTriangle size={18} /> {settings.problem}</div>
      )}
      {banner && <div className={`odoo-banner odoo-banner-${banner.tone}`}><AlertTriangle size={18} /> {banner.text}</div>}

      <form className="card-section" onSubmit={handleSave} autoComplete="off">
        <div className="odoo-form">
          <label className="odoo-field odoo-field-wide">
            <span>Odoo address</span>
            <input className="odoo-input" type="url" placeholder="https://mycompany.odoo.com" value={form.odoo_url}
              onChange={set('odoo_url')} required />
            <span className="odoo-field-help">Must start with https://. Changing it needs the API key to be entered again.</span>
            {err('odoo_url')}
          </label>
          <label className="odoo-field">
            <span>Odoo database (optional)</span>
            <input className="odoo-input" value={form.odoo_database} onChange={set('odoo_database')} maxLength={100} />
            {err('odoo_database')}
          </label>
          <label className="odoo-field">
            <span>API key</span>
            <input className="odoo-input" type="password" autoComplete="new-password" value={form.api_key}
              onChange={set('api_key')} placeholder={keyPlaceholder} />
            <span className="odoo-field-help">Leave empty to keep the stored key. It is never shown again after saving.</span>
            {err('api_key')}
          </label>
          <label className="odoo-field">
            <span>Key expiry date</span>
            <input className="odoo-input" type="date" value={form.api_key_expires_on} onChange={set('api_key_expires_on')} />
            <span className="odoo-field-help">The date Odoo showed when the key was made.</span>
            {err('api_key_expires_on')}
          </label>
          <label className="odoo-field">
            <span>Sync invoices dated from</span>
            <input className="odoo-input" type="date" value={form.sync_start_date} onChange={set('sync_start_date')} required />
            {err('sync_start_date')}
          </label>
          <label className="odoo-field">
            <span>Odoo company ids (optional)</span>
            <input className="odoo-input" inputMode="numeric" placeholder="e.g. 1, 3" value={form.company_ids}
              onChange={set('company_ids')} />
            <span className="odoo-field-help">One or more ids, separated by commas. Empty = invoices of every company in this Odoo.</span>
            {err('company_ids')}
          </label>
          <div className="odoo-field">
            <label className="odoo-checkbox">
              <input type="checkbox" checked={form.auto_sync_enabled} onChange={set('auto_sync_enabled')} />
              Automatic sync on
            </label>
            <span className="odoo-field-help">Off: Odoo is read only when someone presses Sync now.</span>
          </div>
          {form.auto_sync_enabled && (
            <label className="odoo-field">
              <span>Sync every (minutes, optional)</span>
              <input className="odoo-input" type="number" min="5" max="1440" placeholder="10"
                value={form.sync_interval_minutes} onChange={set('sync_interval_minutes')} />
              <span className="odoo-field-help">5 to 1440. Empty = every 10 minutes.</span>
              {err('sync_interval_minutes')}
            </label>
          )}
        </div>

        <div className="odoo-actions">
          <button type="button" className="btn btn-outline" onClick={handleTest} disabled={Boolean(busy)}>
            {busy === 'test' ? <RefreshCw size={16} className="odoo-spin" /> : <PlugZap size={16} />} Test connection
          </button>
          <button type="submit" className="btn btn-primary" disabled={Boolean(busy)}>
            {busy === 'save' ? <RefreshCw size={16} className="odoo-spin" /> : <Save size={16} />} Save
          </button>
          {settings?.api_key_set && (
            <button type="button" className="btn btn-danger" onClick={handleRemoveKey} disabled={Boolean(busy)}>
              <Trash2 size={16} /> Remove key
            </button>
          )}
        </div>

        {test && (
          <>
            <div className={`odoo-banner odoo-banner-${test.ok ? 'ok' : 'bad'}`} style={{ marginTop: 16, maxWidth: 900 }}>
              {test.ok ? 'Connection works. Save to use these settings.' : 'Some checks failed. Nothing was saved.'}
            </div>
            <ul className="odoo-checks">
              {(test.checks || []).map((c, i) => (
                <li key={`${c.check}-${i}`} className={`odoo-check-${c.status}`}>
                  <span className="odoo-check-mark">{MARK[c.status] || '•'}</span>
                  <span>{c.message}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {settings?.updated_at && (
          <p className="odoo-muted" style={{ marginTop: 16 }}>
            Last changed {formatDateTime(settings.updated_at)}{settings.updated_by ? ` by ${settings.updated_by}` : ''}.
          </p>
        )}
      </form>
    </div>
  );
}
