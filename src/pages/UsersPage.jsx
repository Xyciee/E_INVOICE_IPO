import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, RefreshCw, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConfirm, useNotify } from '../context/NotificationContext';
import { usersApi, ROLE_INFO, roleLabel } from '../services/usersService';
import { errorText, fieldErrors, formatDateTime } from '../services/odooService';
import './pages.css';
import './odoo.css';
import './users.css';

/*
 * Users (IT, permission manage_users): create accounts, choose roles, deactivate leavers, reset passwords.
 *   GET/POST /api/users, PATCH /api/users/<id>, POST /api/users/<id>/reset-password, GET /api/roles
 * No delete: a leaver is deactivated (their name stays in the print and audit logs). A temporary password is shown
 * once here and never stored; its owner must choose their own at the next sign-in. Every change is in the audit log.
 */

function StatusChip({ u }) {
  if (!u.is_active) return <span className="odoo-chip odoo-chip-off">Deactivated</span>;
  if (u.must_change_password) {
    return <span className="odoo-chip odoo-chip-warn" title="Has a temporary password">Must set password</span>;
  }
  return <span className="odoo-chip odoo-chip-ok">Active</span>;
}

function displayName(u) {
  return u.full_name || u.username;
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [status, setStatus] = useState('1');   // 1 active, 0 deactivated, '' all
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);  // a user, 'new', or null
  const [password, setPassword] = useState(null); // {username, password, reason} shown once

  const load = useCallback(async () => {
    setLoading(true);
    const [list, roleList] = await Promise.all([usersApi.list({ active: status, role }), usersApi.roles()]);
    setLoading(false);
    if (!list.ok) {
      setError(errorText(list, 'Could not load the users.'));
      return;
    }
    setError('');
    setUsers(list.data.results || []);
    if (roleList.ok) setRoles(roleList.data.results || []);
  }, [status, role]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const text = q.trim().toLowerCase();
    if (!text) return users;
    return users.filter((u) => [u.username, u.full_name, u.email].some((v) => (v || '').toLowerCase().includes(text)));
  }, [users, q]);

  const saved = (updated, temporaryPassword, reason) => {
    setEditing(null);
    if (temporaryPassword) setPassword({ username: updated.username, password: temporaryPassword, reason });
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">
            Accounts and roles. Leavers are deactivated, never deleted. Every change is in the audit log.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'odoo-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <UserPlus size={16} /> New user
          </button>
        </div>
      </div>

      <div className="card-section">
        <div className="odoo-filters">
          <label>
            Search
            <input className="odoo-input odoo-input-wide" placeholder="Name, username or email" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </label>
          <label>
            Role
            <select className="odoo-input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              {roles.map((r) => <option key={r.name} value={r.name}>{roleLabel(r.name)}</option>)}
            </select>
          </label>
          <label>
            Status
            <select className="odoo-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="1">Active</option>
              <option value="0">Deactivated</option>
              <option value="">All</option>
            </select>
          </label>
        </div>

        {error && <div className="odoo-banner odoo-banner-bad">{error}</div>}

        <div className="table-responsive">
          <table className="data-table odoo-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} onClick={() => setEditing(u)} title="Open to edit">
                  <td><strong>{displayName(u)}</strong>
                    {u.is_superuser && <span className="odoo-chip odoo-chip-info users-chip-gap">Superuser</span>}
                    {u.username === me?.username && <span className="odoo-muted"> (you)</span>}
                  </td>
                  <td>{u.username}</td>
                  <td>{u.email || '—'}</td>
                  <td>
                    {u.roles.length
                      ? u.roles.map((r) => <span key={r} className="users-role">{roleLabel(r)}</span>)
                      : <span className="odoo-chip odoo-chip-bad" title="Sees nothing until a role is given">No role</span>}
                  </td>
                  <td><StatusChip u={u} /></td>
                  <td>{u.last_login ? formatDateTime(u.last_login) : 'Never'}</td>
                </tr>
              ))}
              {!loading && shown.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="odoo-muted" style={{ textAlign: 'center', padding: '28px' }}>
                    No users match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <UserDialog user={editing === 'new' ? null : editing} roles={roles} isMe={editing !== 'new' && editing.username === me?.username}
          onClose={() => setEditing(null)} onSaved={saved} />
      )}
      {password && <PasswordOnce {...password} onClose={() => setPassword(null)} />}
    </div>
  );
}

function UserDialog({ user, roles, isMe, onClose, onSaved }) {
  const confirm = useConfirm();
  const notify = useNotify();
  const isNew = !user;
  const [form, setForm] = useState({
    username: '', first_name: user?.first_name || '', last_name: user?.last_name || '', email: user?.email || '',
    roles: user?.roles || []
  });
  const [ownPassword, setOwnPassword] = useState(false);
  const [temporary, setTemporary] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });
  const toggleRole = (name) => setForm({
    ...form, roles: form.roles.includes(name) ? form.roles.filter((r) => r !== name) : [...form.roles, name]
  });

  const fail = (res, fallback) => {
    const errs = fieldErrors(res);
    setErrors(Object.keys(errs).length ? errs : { form: errorText(res, fallback) });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    let res;
    if (isNew) {
      const body = { ...form };
      if (ownPassword) body.temporary_password = temporary;
      res = await usersApi.create(body);
    } else {
      const body = {};
      ['first_name', 'last_name', 'email'].forEach((k) => { if (form[k] !== (user[k] || '')) body[k] = form[k]; });
      if ([...form.roles].sort().join() !== [...user.roles].sort().join()) body.roles = form.roles;
      if (Object.keys(body).length === 0) {
        setBusy(false);
        onClose();
        return;
      }
      res = await usersApi.update(user.id, body);
    }
    setBusy(false);
    if (!res.ok) {
      fail(res, 'Could not save the user.');
      return;
    }
    notify.success(isNew ? 'User created' : 'User saved', res.data.username);
    onSaved(res.data, isNew ? res.data.temporary_password : null, 'new');
  };

  const setActive = async (active) => {
    const ok = await confirm(active ? {
      title: `Reactivate ${user.username}?`, message: 'They can sign in again with their password.',
      confirmText: 'Reactivate', cancelText: 'Cancel'
    } : {
      title: `Deactivate ${user.username}?`,
      message: 'They are signed out everywhere and can no longer sign in. Their name stays in the print and audit logs. You can reactivate them later.',
      confirmText: 'Deactivate', cancelText: 'Cancel', variant: 'danger'
    });
    if (!ok) return;
    setBusy(true);
    const res = await usersApi.update(user.id, { active });
    setBusy(false);
    if (!res.ok) {
      fail(res, 'Could not change the account.');
      return;
    }
    notify.success(active ? 'User reactivated' : 'User deactivated', user.username);
    onSaved(res.data);
  };

  const resetPassword = async () => {
    const ok = await confirm({
      title: `New password for ${user.username}?`,
      message: 'They get a temporary password, are signed out everywhere, and must choose their own at the next sign-in.',
      confirmText: 'Make temporary password', cancelText: 'Cancel', variant: 'danger'
    });
    if (!ok) return;
    setBusy(true);
    const res = await usersApi.resetPassword(user.id);
    setBusy(false);
    if (!res.ok) {
      fail(res, 'Could not reset the password.');
      return;
    }
    onSaved(user, res.data.temporary_password, 'reset');
  };

  return (
    <div className="odoo-modal-backdrop" onClick={() => !busy && onClose()}>
      <form className="odoo-modal" role="dialog" aria-modal="true" aria-labelledby="user-dialog-title"
        onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="odoo-modal-header">
          <div>
            <h2 className="odoo-modal-title" id="user-dialog-title">{isNew ? 'New user' : displayName(user)}</h2>
            <p className="odoo-modal-subtitle">
              {isNew ? 'A personal account for one employee. No shared station accounts.'
                : `${user.username}${user.last_login ? ` · last sign-in ${formatDateTime(user.last_login)}` : ' · never signed in'}`}
            </p>
          </div>
          <button type="button" className="odoo-close" onClick={onClose} disabled={busy} aria-label="Close">&times;</button>
        </div>

        <div className="odoo-modal-body">
          {errors.form && <div className="odoo-banner odoo-banner-bad">{errors.form}</div>}
          {!isNew && !user.is_active && (
            <div className="odoo-banner odoo-banner-warn">This account is deactivated: it cannot sign in.</div>
          )}
          <div className="users-form">
            {isNew && (
              <label className="odoo-field odoo-field-wide">
                <span>Username</span>
                <input className="odoo-input" required maxLength={150} value={form.username} onChange={set('username')}
                  placeholder="e.g. theresa" autoComplete="off" />
                {errors.username ? <span className="odoo-field-error">{errors.username}</span>
                  : <span className="odoo-field-help">What they type to sign in. Letters, digits and @ . + - _ only. Cannot be changed later.</span>}
              </label>
            )}
            <label className="odoo-field">
              <span>First name</span>
              <input className="odoo-input" maxLength={150} value={form.first_name} onChange={set('first_name')} />
              {errors.first_name && <span className="odoo-field-error">{errors.first_name}</span>}
            </label>
            <label className="odoo-field">
              <span>Last name</span>
              <input className="odoo-input" maxLength={150} value={form.last_name} onChange={set('last_name')} />
              {errors.last_name && <span className="odoo-field-error">{errors.last_name}</span>}
            </label>
            <label className="odoo-field odoo-field-wide">
              <span>Email <em className="odoo-optional">optional</em></span>
              <input className="odoo-input" type="email" maxLength={254} value={form.email} onChange={set('email')} />
              {errors.email && <span className="odoo-field-error">{errors.email}</span>}
            </label>
          </div>

          <fieldset className="users-roles">
            <legend>Roles</legend>
            {roles.length === 0 && <p className="odoo-muted">No roles found. IT runs <code>manage.py setup_roles</code> once.</p>}
            {roles.map((r) => (
              <label key={r.name} className={`users-role-option ${form.roles.includes(r.name) ? 'selected' : ''}`}>
                <input type="checkbox" checked={form.roles.includes(r.name)} onChange={() => toggleRole(r.name)} />
                <span>
                  <strong>{roleLabel(r.name)}</strong>
                  <span className="odoo-muted">{ROLE_INFO[r.name]?.help || `${r.permissions.length} permissions`}</span>
                </span>
              </label>
            ))}
            {errors.roles ? <span className="odoo-field-error">{errors.roles}</span>
              : form.roles.length === 0 && <span className="odoo-field-help">Without a role the account sees nothing.</span>}
            {isMe && <span className="odoo-field-help">You cannot take away your own right to manage users.</span>}
          </fieldset>

          {isNew && (
            <fieldset className="users-roles">
              <legend>First password</legend>
              <label className="odoo-checkbox">
                <input type="radio" name="pw" checked={!ownPassword} onChange={() => setOwnPassword(false)} />
                Make one for me (shown once after saving)
              </label>
              <label className="odoo-checkbox">
                <input type="radio" name="pw" checked={ownPassword} onChange={() => setOwnPassword(true)} />
                I will type one
              </label>
              {ownPassword && (
                <label className="odoo-field">
                  <input className="odoo-input" type="text" required value={temporary} autoComplete="off"
                    onChange={(e) => setTemporary(e.target.value)} placeholder="Temporary password" />
                  {errors.temporary_password && <span className="odoo-field-error">{errors.temporary_password}</span>}
                </label>
              )}
              <span className="odoo-field-help">Either way, they must choose their own password the first time they sign in.</span>
            </fieldset>
          )}
        </div>

        <div className="odoo-modal-footer users-footer">
          {!isNew && (
            <span className="users-footer-left">
              <button type="button" className="btn btn-outline" onClick={resetPassword} disabled={busy || !user.is_active}>
                <KeyRound size={16} /> Reset password
              </button>
              {user.is_active ? (
                <button type="button" className="btn btn-outline users-danger" onClick={() => setActive(false)} disabled={busy || isMe}
                  title={isMe ? 'You cannot deactivate your own account' : undefined}>
                  <UserX size={16} /> Deactivate
                </button>
              ) : (
                <button type="button" className="btn btn-outline" onClick={() => setActive(true)} disabled={busy}>
                  <UserCheck size={16} /> Reactivate
                </button>
              )}
            </span>
          )}
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <RefreshCw size={16} className="odoo-spin" /> : null}
            {isNew ? 'Create user' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** A temporary password, shown once (it is not kept anywhere). */
function PasswordOnce({ username, password, reason, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="odoo-modal-backdrop">
      <div className="odoo-modal users-password-modal" role="dialog" aria-modal="true" aria-labelledby="pw-once-title">
        <div className="odoo-modal-header">
          <div>
            <h2 className="odoo-modal-title" id="pw-once-title">
              {reason === 'reset' ? 'New temporary password' : 'User created'}
            </h2>
            <p className="odoo-modal-subtitle">Temporary password for <strong>{username}</strong></p>
          </div>
        </div>
        <div className="odoo-modal-body">
          <div className="users-password">{password}</div>
          <div className="odoo-banner odoo-banner-warn">
            This is shown only now. Give it to {username} in person (not in a group chat).
            They must choose their own password the first time they sign in.
          </div>
        </div>
        <div className="odoo-modal-footer">
          <button type="button" className="btn btn-outline" onClick={copy}>
            <Copy size={16} /> {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
