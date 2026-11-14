import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';
import { usersApi } from '../services/usersService';
import { errorText, fieldErrors } from '../services/odooService';
import './login.css';
import './pages.css';
import './odoo.css';

/*
 * Change your own password (POST /api/me/password).
 * - required: shown instead of the app after signing in with a temporary password (new account or a reset by IT).
 *   Until it is changed, the backend refuses every other screen.
 * - otherwise: the "Change password" page opened from the menu.
 */
function PasswordForm({ required, onDone }) {
  const { refreshUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== repeat) {
      setErrors({ repeat: 'The two new passwords are not the same.' });
      return;
    }
    setBusy(true);
    setErrors({});
    const res = await usersApi.changeMyPassword({ current_password: current, new_password: next });
    if (!res.ok) {
      setBusy(false);
      const errs = fieldErrors(res);
      setErrors(Object.keys(errs).length ? errs : { form: errorText(res, 'Could not change the password.') });
      return;
    }
    setCurrent('');
    setNext('');
    setRepeat('');
    await refreshUser();
    setBusy(false);
    onDone?.();
  };

  const type = show ? 'text' : 'password';
  return (
    <form onSubmit={submit} className="login-form">
      {errors.form && (
        <div className="login-error-alert"><AlertCircle size={16} /><span>{errors.form}</span></div>
      )}
      <div className="form-group">
        <label className="form-label" htmlFor="pw-current">
          {required ? 'Temporary password (the one IT gave you)' : 'Current password'}
        </label>
        <div className="input-with-icon">
          <Lock size={16} className="input-icon-left" />
          <input id="pw-current" type={type} required className="login-input" value={current}
            onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          <button type="button" className="input-icon-btn" onClick={() => setShow(!show)}
            aria-label={show ? 'Hide passwords' : 'Show passwords'}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.current_password && <span className="odoo-field-error">{errors.current_password}</span>}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="pw-new">New password</label>
        <div className="input-with-icon">
          <KeyRound size={16} className="input-icon-left" />
          <input id="pw-new" type={type} required className="login-input" value={next}
            onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </div>
        {errors.new_password
          ? <span className="odoo-field-error">{errors.new_password}</span>
          : <span className="odoo-field-help">At least 8 characters. Not only numbers, not your name, not a common password.</span>}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="pw-repeat">New password again</label>
        <div className="input-with-icon">
          <KeyRound size={16} className="input-icon-left" />
          <input id="pw-repeat" type={type} required className="login-input" value={repeat}
            onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
        </div>
        {errors.repeat && <span className="odoo-field-error">{errors.repeat}</span>}
      </div>
      <button type="submit" className="login-submit-btn" disabled={busy}>
        {busy ? <span className="spinner" /> : 'Save new password'}
      </button>
    </form>
  );
}

/** Full screen, before the app opens: the account still has a temporary password. */
export function RequiredPasswordChange() {
  const { user, logout } = useAuth();
  return (
    <div className="login-page-wrapper">
      <div className="login-bg-glow" />
      <div className="login-bg-glow-2" />
      <div className="login-card">
        <div className="login-header" style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.35rem', margin: '0 0 6px' }}>Choose your own password</h1>
          <p className="odoo-muted" style={{ margin: 0 }}>
            Hello {user?.name}. You signed in with a temporary password. Choose your own before you start.
          </p>
        </div>
        <PasswordForm required />
        <p style={{ textAlign: 'center', marginTop: '14px' }}>
          <button type="button" className="forgot-link" onClick={logout}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}

/** The "Change password" page inside the app. */
export default function ChangePasswordPage() {
  const notify = useNotify();
  const [done, setDone] = useState(false);
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Change password</h1>
          <p className="page-subtitle">Your other signed-in devices are signed out; this one stays signed in.</p>
        </div>
      </div>
      <div className="card-section" style={{ maxWidth: '460px' }}>
        {done && (
          <div className="odoo-banner odoo-banner-ok"><CheckCircle2 size={16} /> Your password was changed.</div>
        )}
        <PasswordForm onDone={() => { setDone(true); notify.success('Password changed', 'Use the new password next time.'); }} />
      </div>
    </div>
  );
}
