import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Search,
  Send,
  Copy,
  Trash2,
  Plus,
  X,
  Lock,
  ShieldCheck,
  Clock,
  HardDrive,
  Wand2,
  RotateCcw,
  History,
  Terminal
} from 'lucide-react';
import { API_GROUPS, ALL_ENDPOINTS, getPathParams } from '../services/apiEndpoints';
import { apiRequest, buildUrl } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { useNotify, useConfirm } from '../context/NotificationContext';
import './apiTester.css';

const HISTORY_KEY = 'einvoice_api_tester_history';
const OPEN_PERMS = ['anyone', 'signed in'];

function prettyBody(body) {
  return body === undefined ? '' : JSON.stringify(body, null, 2);
}

function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function statusClass(status) {
  if (status === 0) return 'status-error';
  if (status < 300) return 'status-ok';
  if (status < 400) return 'status-info';
  if (status < 500) return 'status-warn';
  return 'status-error';
}

function MethodBadge({ method, small }) {
  return (
    <span className={`method-badge method-${method.toLowerCase()} ${small ? 'method-sm' : ''}`}>
      {method}
    </span>
  );
}

/** Minimal JSON syntax highlighter (safe — escapes HTML first) */
function highlightJson(value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const escaped = (json ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'json-key' : 'json-string';
      else if (/true|false/.test(match)) cls = 'json-bool';
      else if (/null/.test(match)) cls = 'json-null';
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export default function ApiTesterPage() {
  const { user } = useAuth();
  const notify = useNotify();
  const confirm = useConfirm();

  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState('health');
  const [pathValues, setPathValues] = useState({});
  const [queryRows, setQueryRows] = useState([]);
  const [bodyText, setBodyText] = useState('');
  const [bodyError, setBodyError] = useState('');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState(null);
  const [resTab, setResTab] = useState('body');
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  });

  const endpoint = useMemo(
    () => ALL_ENDPOINTS.find((e) => e.id === selectedId) || ALL_ENDPOINTS[0],
    [selectedId]
  );
  const pathParams = useMemo(() => getPathParams(endpoint), [endpoint]);
  const hasBody = endpoint.method !== 'GET';

  const userPerms = useMemo(() => new Set(user?.permissions || []), [user]);
  const canUse = useCallback(
    (ep) => OPEN_PERMS.includes(ep.permission) || userPerms.has(ep.permission),
    [userPerms]
  );

  // Reset the form when switching endpoints
  const selectEndpoint = (ep, preset) => {
    setSelectedId(ep.id);
    setPathValues(preset?.pathValues || {});
    setQueryRows(
      preset?.queryRows ||
        (ep.query || []).map((q) => ({ key: q.key, value: '', placeholder: q.placeholder }))
    );
    setBodyText(preset?.bodyText ?? prettyBody(ep.body));
    setBodyError('');
    setResponse(preset?.response || null);
    setResTab('body');
  };

  // Initialize defaults for first endpoint
  useEffect(() => {
    selectEndpoint(endpoint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvedPath = useMemo(
    () =>
      endpoint.path.replace(/\{(\w+)\}/g, (_, name) =>
        pathValues[name] ? encodeURIComponent(pathValues[name]) : `{${name}}`
      ),
    [endpoint, pathValues]
  );

  const queryObject = useMemo(
    () => Object.fromEntries(queryRows.filter((r) => r.key).map((r) => [r.key, r.value])),
    [queryRows]
  );

  const previewUrl = buildUrl(resolvedPath, queryObject);

  const filteredGroups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return API_GROUPS;
    return API_GROUPS.map((g) => ({
      ...g,
      endpoints: g.endpoints.filter((e) =>
        `${e.method} ${e.path} ${e.description} ${e.permission}`.toLowerCase().includes(f)
      )
    })).filter((g) => g.endpoints.length);
  }, [filter]);

  const handleFormat = () => {
    if (!bodyText.trim()) return;
    try {
      setBodyText(JSON.stringify(JSON.parse(bodyText), null, 2));
      setBodyError('');
    } catch (e) {
      setBodyError(e.message);
    }
  };

  const handleSend = async () => {
    // Validate path params
    const missing = pathParams.filter((p) => !String(pathValues[p] || '').trim());
    if (missing.length) {
      notify.warning('Missing path parameter', `Please fill in: ${missing.join(', ')}`);
      return;
    }

    // Validate JSON body
    let body;
    if (hasBody && bodyText.trim()) {
      try {
        body = JSON.parse(bodyText);
        setBodyError('');
      } catch (e) {
        setBodyError(e.message);
        notify.danger('Invalid JSON body', e.message);
        return;
      }
    }

    if (endpoint.id === 'logout') {
      const ok = await confirm({
        title: 'Call logout endpoint?',
        message: 'This ends your backend session. You will need to sign in again.',
        confirmText: 'Send Logout',
        variant: 'warning'
      });
      if (!ok) return;
    }

    setSending(true);
    const res = await apiRequest(endpoint.method, resolvedPath, { query: queryObject, body });
    setSending(false);
    setResponse(res);
    setResTab('body');

    if (res.networkError) {
      notify.danger('Network error', res.data?.message || 'Could not reach the server.');
    }

    const entry = {
      id: Date.now(),
      endpointId: endpoint.id,
      method: endpoint.method,
      path: resolvedPath,
      status: res.status,
      timeMs: res.timeMs,
      at: new Date().toISOString(),
      pathValues,
      queryRows,
      bodyText
    };
    setHistory((h) => {
      const next = [entry, ...h].slice(0, 15);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  // Ctrl/Cmd + Enter sends
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!sending) handleSend();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      notify.success('Copied', `${label} copied to clipboard.`, { duration: 2000 });
    } catch {
      notify.danger('Copy failed', 'Clipboard is not available.');
    }
  };

  const curlCommand = useMemo(() => {
    const full = `https://einvoice.ipolymersolutionscorp.com${resolvedPath}${
      previewUrl.includes('?') ? previewUrl.slice(previewUrl.indexOf('?')) : ''
    }`;
    let cmd = `curl -X ${endpoint.method} "${full}"`;
    if (hasBody && bodyText.trim()) {
      cmd += ` \\\n  -H "Content-Type: application/json" \\\n  -H "X-CSRFToken: <token>" \\\n  -d '${bodyText.replace(/\s*\n\s*/g, ' ')}'`;
    }
    return cmd;
  }, [endpoint, resolvedPath, previewUrl, hasBody, bodyText]);

  const restoreHistory = (h) => {
    const ep = ALL_ENDPOINTS.find((e) => e.id === h.endpointId);
    if (ep) selectEndpoint(ep, { pathValues: h.pathValues, queryRows: h.queryRows, bodyText: h.bodyText });
  };

  const clearHistory = async () => {
    const ok = await confirm({
      title: 'Clear request history?',
      message: 'This removes all saved requests from this browser.',
      confirmText: 'Clear',
      variant: 'danger',
      icon: Trash2
    });
    if (!ok) return;
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    notify.success('History cleared');
  };

  const responseText =
    response && (typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));

  return (
    <div className="api-tester animate-fade-in">
      <div className="api-tester-header">
        <div>
          <h1 className="api-tester-title">
            <Terminal size={22} /> API Tester
          </h1>
          <p className="api-tester-subtitle">
            Send live GET / POST / PATCH requests to the E-Invoice backend using your current session.
          </p>
        </div>
        <div className="api-tester-session">
          <ShieldCheck size={16} />
          <span>
            {user?.username || user?.name || 'Unknown'} · {userPerms.size} permission
            {userPerms.size === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="api-tester-grid">
        {/* ------------------------- Endpoint list ------------------------- */}
        <aside className="api-panel api-endpoints">
          <div className="api-search">
            <Search size={15} />
            <input
              id="api-endpoint-search"
              placeholder="Filter endpoints…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div className="api-endpoint-scroll">
            {filteredGroups.map((g) => (
              <div key={g.group} className="api-group">
                <div className="api-group-title">{g.group}</div>
                {g.endpoints.map((ep) => {
                  const allowed = canUse(ep);
                  return (
                    <button
                      key={ep.id}
                      id={`api-endpoint-${ep.id}`}
                      className={`api-endpoint-item ${ep.id === selectedId ? 'active' : ''}`}
                      onClick={() => selectEndpoint(ep)}
                      title={ep.description}
                    >
                      <MethodBadge method={ep.method} small />
                      <span className="api-endpoint-path">{ep.path.replace('/api', '')}</span>
                      {!allowed && <Lock size={12} className="api-endpoint-lock" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {!filteredGroups.length && <div className="api-empty">No endpoints match.</div>}
          </div>
        </aside>

        {/* ------------------------- Request builder ------------------------- */}
        <section className="api-main">
          <div className="api-panel">
            <div className="api-request-bar">
              <MethodBadge method={endpoint.method} />
              <code className="api-url" title={previewUrl}>{previewUrl}</code>
              <button
                className="api-icon-btn"
                onClick={() => copy(curlCommand, 'cURL command')}
                title="Copy as cURL"
              >
                <Copy size={15} />
              </button>
              <button
                id="api-send-btn"
                className="api-send-btn"
                onClick={handleSend}
                disabled={sending}
                title="Send (Ctrl + Enter)"
              >
                {sending ? <span className="spinner" /> : <Send size={15} />}
                <span>{sending ? 'Sending' : 'Send'}</span>
              </button>
            </div>

            <div className="api-meta">
              <p className="api-description">{endpoint.description}</p>
              <span className={`api-perm ${canUse(endpoint) ? 'allowed' : 'denied'}`}>
                {canUse(endpoint) ? <ShieldCheck size={13} /> : <Lock size={13} />}
                {endpoint.permission}
              </span>
            </div>

            {/* Path params */}
            {pathParams.length > 0 && (
              <div className="api-section">
                <div className="api-section-title">Path Parameters</div>
                <div className="api-kv-grid">
                  {pathParams.map((p) => (
                    <label key={p} className="api-kv-row">
                      <span className="api-kv-key">{p}</span>
                      <input
                        id={`api-path-${p}`}
                        className="api-input"
                        placeholder={`Enter ${p}`}
                        value={pathValues[p] || ''}
                        onChange={(e) => setPathValues((v) => ({ ...v, [p]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Query params */}
            <div className="api-section">
              <div className="api-section-title">
                Query Parameters
                <button
                  className="api-link-btn"
                  onClick={() => setQueryRows((r) => [...r, { key: '', value: '' }])}
                >
                  <Plus size={13} /> Add
                </button>
              </div>
              {queryRows.length === 0 ? (
                <div className="api-hint">No query parameters.</div>
              ) : (
                <div className="api-query-list">
                  {queryRows.map((row, i) => (
                    <div key={i} className="api-query-row">
                      <input
                        className="api-input"
                        placeholder="key"
                        value={row.key}
                        onChange={(e) =>
                          setQueryRows((r) => r.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                        }
                      />
                      <input
                        className="api-input"
                        placeholder={row.placeholder || 'value'}
                        value={row.value}
                        onChange={(e) =>
                          setQueryRows((r) => r.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                        }
                      />
                      <button
                        className="api-icon-btn"
                        onClick={() => setQueryRows((r) => r.filter((_, j) => j !== i))}
                        aria-label="Remove parameter"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Body */}
            {hasBody && (
              <div className="api-section">
                <div className="api-section-title">
                  JSON Body
                  <div className="api-section-actions">
                    <button className="api-link-btn" onClick={handleFormat}>
                      <Wand2 size={13} /> Format
                    </button>
                    <button
                      className="api-link-btn"
                      onClick={() => {
                        setBodyText(prettyBody(endpoint.body));
                        setBodyError('');
                      }}
                    >
                      <RotateCcw size={13} /> Reset
                    </button>
                  </div>
                </div>
                <textarea
                  id="api-body-editor"
                  className={`api-body ${bodyError ? 'has-error' : ''}`}
                  spellCheck={false}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder="{ }"
                  rows={Math.min(14, Math.max(5, bodyText.split('\n').length + 1))}
                />
                {bodyError && <div className="api-body-error">{bodyError}</div>}
              </div>
            )}
          </div>

          {/* ------------------------- Response ------------------------- */}
          <div className="api-panel api-response">
            <div className="api-response-head">
              <div className="api-tabs">
                <button
                  className={`api-tab ${resTab === 'body' ? 'active' : ''}`}
                  onClick={() => setResTab('body')}
                >
                  Response
                </button>
                <button
                  className={`api-tab ${resTab === 'headers' ? 'active' : ''}`}
                  onClick={() => setResTab('headers')}
                >
                  Headers
                </button>
              </div>

              {response && (
                <div className="api-response-stats">
                  <span className={`api-status ${statusClass(response.status)}`}>
                    {response.status || 'ERR'} {response.statusText}
                  </span>
                  <span className="api-stat">
                    <Clock size={13} /> {response.timeMs} ms
                  </span>
                  <span className="api-stat">
                    <HardDrive size={13} /> {formatBytes(response.size)}
                  </span>
                  <button
                    className="api-icon-btn"
                    onClick={() => copy(responseText || '', 'Response')}
                    title="Copy response"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
            </div>

            {!response ? (
              <div className="api-response-empty">
                <Send size={28} />
                <p>Press <kbd>Send</kbd> or <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to make a request.</p>
              </div>
            ) : resTab === 'body' ? (
              <pre
                className="api-code"
                dangerouslySetInnerHTML={{
                  __html:
                    typeof response.data === 'string'
                      ? highlightJson(JSON.stringify(response.data))
                      : highlightJson(response.data)
                }}
              />
            ) : (
              <div className="api-headers-table">
                {Object.entries(response.headers).map(([k, v]) => (
                  <div key={k} className="api-header-row">
                    <span className="api-header-key">{k}</span>
                    <span className="api-header-val">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ------------------------- History ------------------------- */}
          <div className="api-panel">
            <div className="api-section-title" style={{ marginBottom: 10 }}>
              <span className="api-inline">
                <History size={14} /> Recent Requests
              </span>
              {history.length > 0 && (
                <button className="api-link-btn danger" onClick={clearHistory}>
                  <Trash2 size={13} /> Clear
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="api-hint">No requests yet.</div>
            ) : (
              <div className="api-history">
                {history.map((h) => (
                  <button key={h.id} className="api-history-item" onClick={() => restoreHistory(h)}>
                    <MethodBadge method={h.method} small />
                    <span className="api-history-path">{h.path}</span>
                    <span className={`api-status small ${statusClass(h.status)}`}>{h.status || 'ERR'}</span>
                    <span className="api-history-time">
                      {new Date(h.at).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
