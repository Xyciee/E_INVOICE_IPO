import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Gauge,
  Play,
  RefreshCw,
  Zap,
  Clock,
  HardDrive,
  Activity,
  Search,
  ShoppingCart
} from 'lucide-react';
import { apiRequest, clearApiCache } from '../services/apiClient';
import {
  fetchActiveUnprintedOrders,
  extractDocumentList,
  normalizeDocumentRecord,
  invalidateOrdersAndDocsCache
} from '../services/scanService';
import './pages.css';

const BENCHMARK_ENDPOINTS = [
  {
    id: 'orders-prepack-all',
    name: 'OrdersPage: Pre-Pack Queue (problems_only=0, limit=200)',
    method: 'GET',
    path: '/api/prepack',
    query: { problems_only: 0, limit: 200 },
    category: 'OrdersPage'
  },
  {
    id: 'orders-docs-unprinted',
    name: 'OrdersPage: Unprinted Documents (printed=0, limit=200)',
    method: 'GET',
    path: '/api/documents',
    query: { printed: 0, limit: 200 },
    category: 'OrdersPage'
  },
  {
    id: 'orders-list',
    name: 'OrdersPage: Orders List (/api/orders?limit=200)',
    method: 'GET',
    path: '/api/orders',
    query: { limit: 200 },
    category: 'OrdersPage'
  },
  {
    id: 'orders-prints',
    name: 'OrdersPage: Printed Invoices (/api/prints)',
    method: 'GET',
    path: '/api/prints',
    query: {},
    category: 'OrdersPage'
  },
  {
    id: 'health',
    name: 'Database & Backend Health',
    method: 'GET',
    path: '/api/health',
    query: {},
    category: 'System'
  },
  {
    id: 'csrf',
    name: 'CSRF Token Handshake',
    method: 'GET',
    path: '/api/auth/csrf',
    query: {},
    category: 'Auth'
  },
  {
    id: 'me',
    name: 'Current Session Profile',
    method: 'GET',
    path: '/api/me',
    query: {},
    category: 'Auth'
  },
  {
    id: 'documents',
    name: 'Documents Ledger (200 limit)',
    method: 'GET',
    path: '/api/documents',
    query: { limit: 200 },
    category: 'Documents'
  },
  {
    id: 'scans-unresolved',
    name: 'Unresolved Scans List',
    method: 'GET',
    path: '/api/scans/unresolved',
    query: {},
    category: 'Packing Scan'
  },
  {
    id: 'cn-candidates',
    name: 'Credit Note Candidates',
    method: 'GET',
    path: '/api/credit-notes/candidates',
    query: {},
    category: 'Credit Notes'
  },
  {
    id: 'stations',
    name: 'Packing Stations List',
    method: 'GET',
    path: '/api/stations',
    query: {},
    category: 'Stations'
  },
  {
    id: 'audit',
    name: 'Audit Trail Logs',
    method: 'GET',
    path: '/api/audit',
    query: {},
    category: 'Audit'
  }
];

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getRecordCount(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length;
  if (Array.isArray(data.results)) return data.results.length;
  if (Array.isArray(data.documents)) return data.documents.length;
  if (Array.isArray(data.orders)) return data.orders.length;
  if (Array.isArray(data.scans)) return data.scans.length;
  if (Array.isArray(data.stations)) return data.stations.length;
  return null;
}

function getSpeedRating(ms) {
  if (ms === null || ms === undefined) {
    return { label: 'Not Tested', badge: 'badge-secondary', color: '#94a3b8' };
  }
  if (ms < 200) {
    return { label: 'Fast', badge: 'badge-emerald', color: '#10b981' };
  }
  if (ms <= 600) {
    return { label: 'Moderate', badge: 'badge-amber', color: '#f59e0b' };
  }
  return { label: 'Slow', badge: 'badge-rose', color: '#f43f5e' };
}

export default function ApiSpeedTestPage() {
  const [results, setResults] = useState({});
  const [runningAll, setRunningAll] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [mode, setMode] = useState('sequential');
  const [iterations, setIterations] = useState(1);
  const [useCacheMode, setUseCacheMode] = useState(true);

  // OrdersPage.jsx Dedicated Profiler State
  const [ordersPageProfile, setOrdersPageProfile] = useState(null);
  const [ordersPageRunning, setOrdersPageRunning] = useState(false);

  const [customTracking, setCustomTracking] = useState('');
  const [customResult, setCustomResult] = useState(null);
  const [customRunning, setCustomRunning] = useState(false);

  const runSingleEndpoint = useCallback(
    async (ep, runsCount = iterations) => {
      setRunningId(ep.id);
      const times = [];
      let lastRes = null;

      for (let i = 0; i < runsCount; i++) {
        const res = await apiRequest(ep.method, ep.path, {
          query: ep.query,
          bypassCache: !useCacheMode
        });
        times.push(res.timeMs);
        lastRes = res;
      }

      const avgMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      const minMs = Math.min(...times);
      const maxMs = Math.max(...times);
      const records = getRecordCount(lastRes?.data);

      const entry = {
        id: ep.id,
        ok: lastRes?.ok ?? false,
        status: lastRes?.status ?? 0,
        statusText: lastRes?.statusText || '',
        cached: Boolean(lastRes?.cached),
        lastMs: lastRes?.timeMs ?? avgMs,
        avgMs,
        minMs,
        maxMs,
        runs: times.length,
        size: lastRes?.size ?? 0,
        records,
        testedAt: new Date().toLocaleTimeString('en-PH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      };

      setResults((prev) => ({
        ...prev,
        [ep.id]: entry
      }));
      setRunningId(null);
      return entry;
    },
    [iterations, useCacheMode]
  );

  // Profile exact OrdersPage.jsx loadUnprintedOrders + hydrateOrderDetails pipeline
  const runOrdersPageSpeedProfile = useCallback(async (forceLive = false) => {
    setOrdersPageRunning(true);
    const bypass = forceLive === true ? true : !useCacheMode;
    const totalStart = performance.now();

    // 1. Measure the 2 parallel requests inside optimized fetchActiveUnprintedOrders('')
    const parallelStart = performance.now();
    const [prepackRes, docsRes] = await Promise.all([
      apiRequest('GET', '/api/prepack', {
        query: { problems_only: 0, limit: 200 },
        bypassCache: bypass
      }),
      apiRequest('GET', '/api/documents', { query: { limit: 200 }, bypassCache: bypass })
    ]);
    const parallelWallMs = Math.round(performance.now() - parallelStart);

    // 2. Measure full fetchActiveUnprintedOrders() end-to-end
    const fnStart = performance.now();
    const fullQueue = await fetchActiveUnprintedOrders('', { forceRefresh: bypass });
    const fnTotalMs = Math.round(performance.now() - fnStart);

    // 3. If at least 1 order exists, test modal hydration speed (hydrateOrderDetails)
    const sampleOrder = fullQueue.unprintedOrders?.[0] || null;
    let draftRes = null;
    let docDetailRes = null;

    if (sampleOrder) {
      if (sampleOrder.id) {
        docDetailRes = await apiRequest(
          'GET',
          `/api/documents/${encodeURIComponent(sampleOrder.id)}`,
          { bypassCache: bypass }
        );
      }
      if (
        sampleOrder.platform &&
        sampleOrder.storeId &&
        sampleOrder.orderId &&
        sampleOrder.orderId !== '—'
      ) {
        const p = encodeURIComponent(String(sampleOrder.platform).toLowerCase().trim());
        const s = encodeURIComponent(String(sampleOrder.storeId).trim());
        const o = encodeURIComponent(String(sampleOrder.orderId).trim());
        draftRes = await apiRequest('GET', `/api/orders/${p}/${s}/${o}/draft`, {
          bypassCache: bypass
        });
      }
    } else if (prepackRes.ok && prepackRes.data) {
      const list = extractDocumentList(prepackRes.data);
      const firstNorm = list.length > 0 ? normalizeDocumentRecord(list[0]) : null;
      if (firstNorm?.platform && firstNorm?.storeId && firstNorm?.orderId !== '—') {
        const p = encodeURIComponent(String(firstNorm.platform).toLowerCase().trim());
        const s = encodeURIComponent(String(firstNorm.storeId).trim());
        const o = encodeURIComponent(String(firstNorm.orderId).trim());
        draftRes = await apiRequest('GET', `/api/orders/${p}/${s}/${o}/draft`, {
          bypassCache: bypass
        });
      }
    }

    const nowLabel = new Date().toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Sync into main table results as well
    setResults((prev) => ({
      ...prev,
      'orders-prepack-all': {
        id: 'orders-prepack-all',
        ok: prepackRes.ok,
        status: prepackRes.status,
        cached: prepackRes.cached,
        avgMs: prepackRes.timeMs,
        minMs: prepackRes.timeMs,
        maxMs: prepackRes.timeMs,
        size: prepackRes.size,
        records: getRecordCount(prepackRes.data),
        testedAt: nowLabel
      },
      documents: {
        id: 'documents',
        ok: docsRes.ok,
        status: docsRes.status,
        cached: docsRes.cached,
        avgMs: docsRes.timeMs,
        minMs: docsRes.timeMs,
        maxMs: docsRes.timeMs,
        size: docsRes.size,
        records: getRecordCount(docsRes.data),
        testedAt: nowLabel
      }
    }));

    const steps = [
      {
        step: '1. fetchPrepackOrders()',
        endpoint: 'GET /api/prepack?problems_only=0&limit=200',
        status: prepackRes.status,
        ok: prepackRes.ok,
        cached: prepackRes.cached,
        timeMs: prepackRes.timeMs,
        size: prepackRes.size,
        records: getRecordCount(prepackRes.data),
        note: prepackRes.cached
          ? 'Served instantly from shared cache (shared with Dashboard & Invoices)'
          : 'Live network fetch (nothing is cached)'
      },
      {
        step: '2. fetchDocumentsRegister()',
        endpoint: 'GET /api/documents?limit=200',
        status: docsRes.status,
        ok: docsRes.ok,
        cached: docsRes.cached,
        timeMs: docsRes.timeMs,
        size: docsRes.size,
        records: getRecordCount(docsRes.data),
        note: docsRes.cached
          ? 'Served instantly from shared cache (shared with Dashboard & Invoices)'
          : 'Live network fetch (nothing is cached)'
      }
    ];

    if (docDetailRes) {
      steps.push({
        step: '3. hydrateOrderDetails() — Doc',
        endpoint: docDetailRes.url,
        status: docDetailRes.status,
        ok: docDetailRes.ok,
        cached: docDetailRes.cached,
        timeMs: docDetailRes.timeMs,
        size: docDetailRes.size,
        records: 1,
        note: docDetailRes.cached
          ? 'Served from cache on repeat click'
          : 'Called in parallel when clicking Eye/Print on an order with ID'
      });
    }

    if (draftRes) {
      steps.push({
        step: '4. hydrateOrderDetails() — Draft',
        endpoint: draftRes.url,
        status: draftRes.status,
        ok: draftRes.ok,
        cached: draftRes.cached,
        timeMs: draftRes.timeMs,
        size: draftRes.size,
        records: draftRes.data?.lines?.length ?? null,
        note: draftRes.cached
          ? 'Served from cache on repeat click'
          : 'Called in parallel when clicking Eye/Print to load order line items'
      });
    }

    setOrdersPageProfile({
      fnTotalMs,
      parallelWallMs,
      cached: Boolean(fullQueue.cached || (prepackRes.cached && docsRes.cached)),
      unprintedCount: fullQueue.unprintedOrders?.length || 0,
      printedCount: fullQueue.printedCount || 0,
      totalSuiteMs: Math.round(performance.now() - totalStart),
      testedAt: nowLabel,
      steps
    });

    setOrdersPageRunning(false);
  }, [useCacheMode]);

  // Automatically run OrdersPage.jsx speed test when opening the page
  useEffect(() => {
    runOrdersPageSpeedProfile();
  }, [runOrdersPageSpeedProfile]);

  const handleRunAll = async () => {
    if (runningAll) return;
    setRunningAll(true);

    if (mode === 'parallel') {
      await Promise.all(
        BENCHMARK_ENDPOINTS.map((ep) => runSingleEndpoint(ep, iterations))
      );
    } else {
      for (const ep of BENCHMARK_ENDPOINTS) {
        await runSingleEndpoint(ep, iterations);
      }
    }

    setRunningAll(false);
  };

  const handleCustomScanTest = async (e) => {
    e.preventDefault();
    const code = customTracking.trim();
    if (!code || customRunning) return;

    setCustomRunning(true);
    const path = code.startsWith('/api/')
      ? code
      : `/api/scan/${encodeURIComponent(code)}`;
    const res = await apiRequest('GET', path);
    setCustomResult({
      path,
      ok: res.ok,
      status: res.status,
      timeMs: res.timeMs,
      size: res.size,
      records: getRecordCount(res.data),
      testedAt: new Date().toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    });
    setCustomRunning(false);
  };

  const testedEntries = useMemo(() => Object.values(results), [results]);

  const summary = useMemo(() => {
    if (testedEntries.length === 0) {
      return {
        avgMs: null,
        fastest: null,
        slowest: null,
        totalBytes: 0,
        successCount: 0,
        totalTested: 0,
        maxMs: 1000
      };
    }

    const totalMs = testedEntries.reduce((sum, r) => sum + r.avgMs, 0);
    const avgMs = Math.round(totalMs / testedEntries.length);
    const sorted = [...testedEntries].sort((a, b) => a.avgMs - b.avgMs);
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];
    const totalBytes = testedEntries.reduce((sum, r) => sum + (r.size || 0), 0);
    const successCount = testedEntries.filter(
      (r) => r.status >= 200 && r.status < 400
    ).length;

    return {
      avgMs,
      fastest,
      slowest,
      totalBytes,
      successCount,
      totalTested: testedEntries.length,
      maxMs: Math.max(slowest?.avgMs || 500, 300)
    };
  }, [testedEntries]);

  const findEndpointLabel = (id) =>
    BENCHMARK_ENDPOINTS.find((e) => e.id === id)?.path || '—';

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Gauge size={24} style={{ color: 'var(--primary)' }} />
            API Speed Test &amp; Fetch Benchmark
          </h1>
          <p className="page-subtitle">
            Measure real-time fetch latency, payload size, and database response times across E-Invoice endpoints.
          </p>
        </div>

        <div className="page-actions" style={{ flexWrap: 'wrap' }}>
          <select
            value={useCacheMode ? 'cached' : 'live'}
            onChange={(e) => setUseCacheMode(e.target.value === 'cached')}
            disabled={runningAll || ordersPageRunning}
            style={{
              height: '38px',
              padding: '0 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
            aria-label="Cache Mode"
          >
            <option value="cached">Use Shared Cache (Default)</option>
            <option value="live">Bypass Cache (Live Network)</option>
          </select>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              clearApiCache();
              invalidateOrdersAndDocsCache();
              runOrdersPageSpeedProfile(true);
            }}
            disabled={ordersPageRunning || runningAll}
            title="Clear all cached API responses and run fresh network fetch"
          >
            <RefreshCw size={15} /> Clear Cache &amp; Re-test
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => runOrdersPageSpeedProfile(false)}
            disabled={ordersPageRunning || runningAll}
          >
            {ordersPageRunning ? (
              <>
                <RefreshCw size={15} className="spinner" /> Profiling OrdersPage...
              </>
            ) : (
              <>
                <ShoppingCart size={15} /> Test OrdersPage.jsx Speed
              </>
            )}
          </button>

          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={runningAll}
            style={{
              height: '38px',
              padding: '0 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
            aria-label="Execution Mode"
          >
            <option value="sequential">Sequential Fetch</option>
            <option value="parallel">Parallel (Concurrent)</option>
          </select>

          <select
            value={iterations}
            onChange={(e) => setIterations(Number(e.target.value))}
            disabled={runningAll}
            style={{
              height: '38px',
              padding: '0 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
            aria-label="Iterations per endpoint"
          >
            <option value={1}>1x Run per API</option>
            <option value={3}>3x Runs (Avg/Min/Max)</option>
            <option value={5}>5x Runs (Avg/Min/Max)</option>
          </select>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunAll}
            disabled={runningAll}
          >
            {runningAll ? (
              <>
                <RefreshCw size={15} className="spinner" /> Running Benchmark...
              </>
            ) : (
              <>
                <Play size={15} /> Run All Speed Tests
              </>
            )}
          </button>
        </div>
      </div>

      {/* Top Metrics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">OrdersPage Total Load Time</span>
            <div className="stat-card-icon-wrap" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)' }}>
              <ShoppingCart size={20} />
            </div>
          </div>
          <div className="stat-card-value">
            {ordersPageProfile ? `${ordersPageProfile.fnTotalMs} ms` : 'Testing...'}
          </div>
          <div className="stat-card-footer">
            {ordersPageProfile ? (
              <>
                <span className={`badge ${getSpeedRating(ordersPageProfile.fnTotalMs).badge}`}>
                  {getSpeedRating(ordersPageProfile.fnTotalMs).label}
                </span>
                <span className="trend-description">
                  {ordersPageProfile.unprintedCount} unprinted orders fetched
                </span>
              </>
            ) : (
              <span className="trend-description">Running fetchActiveUnprintedOrders()...</span>
            )}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Average API Latency</span>
            <div className="stat-card-icon-wrap" style={{ background: 'rgba(14, 165, 233, 0.1)', color: 'var(--info)' }}>
              <Clock size={20} />
            </div>
          </div>
          <div className="stat-card-value">
            {summary.avgMs !== null ? `${summary.avgMs} ms` : '—'}
          </div>
          <div className="stat-card-footer">
            {summary.avgMs !== null ? (
              <span className={`badge ${getSpeedRating(summary.avgMs).badge}`}>
                {getSpeedRating(summary.avgMs).label}
              </span>
            ) : (
              <span className="trend-description">Across tested endpoints</span>
            )}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Fastest Endpoint</span>
            <div className="stat-card-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald)' }}>
              <Zap size={20} />
            </div>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--accent-emerald)' }}>
            {summary.fastest ? `${summary.fastest.avgMs} ms` : '—'}
          </div>
          <div className="stat-card-footer">
            <span className="trend-description" style={{ fontFamily: 'monospace' }}>
              {summary.fastest ? findEndpointLabel(summary.fastest.id) : 'Not tested yet'}
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Slowest Endpoint</span>
            <div className="stat-card-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--accent-amber)' }}>
              <Activity size={20} />
            </div>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--accent-amber)' }}>
            {summary.slowest ? `${summary.slowest.avgMs} ms` : '—'}
          </div>
          <div className="stat-card-footer">
            <span className="trend-description" style={{ fontFamily: 'monospace' }}>
              {summary.slowest ? findEndpointLabel(summary.slowest.id) : 'Not tested yet'}
            </span>
          </div>
        </div>
      </div>

      {/* Dedicated OrdersPage.jsx API Fetch Waterfall & Speed Breakdown */}
      <div className="card-section">
        <div className="card-section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="card-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingCart size={18} style={{ color: 'var(--primary)' }} />
              OrdersPage.jsx — Live API Fetch Speed Profile (fetchActiveUnprintedOrders &amp; hydrateOrderDetails)
            </h2>
            <p className="page-subtitle">
              Breakdown of every API call triggered by <code>src/pages/OrdersPage.jsx</code> on page load and order inspection.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => runOrdersPageSpeedProfile(false)}
            disabled={ordersPageRunning}
          >
            {ordersPageRunning ? (
              <>
                <RefreshCw size={14} className="spinner" /> Re-testing OrdersPage...
              </>
            ) : (
              <>
                <RefreshCw size={14} /> Re-test OrdersPage APIs
              </>
            )}
          </button>
        </div>

        {ordersPageRunning && !ordersPageProfile ? (
          <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={18} className="spinner" style={{ marginBottom: '8px' }} />
            <div>Profiling OrdersPage.jsx API calls...</div>
          </div>
        ) : ordersPageProfile ? (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>OrdersPage Step</th>
                  <th>Endpoint Called</th>
                  <th>HTTP Status</th>
                  <th>Payload / Records</th>
                  <th>Fetch Time</th>
                  <th>Diagnostic Note</th>
                </tr>
              </thead>
              <tbody>
                {ordersPageProfile.steps.map((s, idx) => {
                  const rating = getSpeedRating(s.timeMs);
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700 }}>{s.step}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.endpoint}</td>
                      <td>
                        <span
                          className={`badge ${
                            s.status >= 200 && s.status < 300
                              ? 'badge-emerald'
                              : s.status === 404
                                ? 'badge-amber'
                                : 'badge-rose'
                          }`}
                        >
                          HTTP {s.status || 'ERR'}
                        </span>
                      </td>
                      <td>
                        <strong>{formatBytes(s.size)}</strong>
                        {s.records !== null && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '6px' }}>
                            ({s.records} records)
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontFamily: 'monospace', color: rating.color, fontSize: '0.92rem' }}>
                            {s.timeMs} ms
                          </strong>
                          <span className={`badge ${rating.badge}`}>{rating.label}</span>
                          {s.cached && (
                            <span className="badge badge-primary">Cached</span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* Custom Waybill / Endpoint Speed Lookup */}
      <div className="card-section">
        <div className="card-section-header" style={{ flexWrap: 'wrap', gap: '12px', marginBottom: customResult ? '14px' : 0 }}>
          <div>
            <h2 className="card-section-title">Custom Waybill / Endpoint Fetch Test</h2>
            <p className="page-subtitle">
              Test a specific waybill tracking number (<code>/api/scan/:tracking</code>) or any custom <code>/api/...</code> path.
            </p>
          </div>

          <form
            className="orders-search-form"
            onSubmit={handleCustomScanTest}
            style={{ maxWidth: '460px' }}
          >
            <div className="orders-search-input-wrap">
              <Search size={15} className="orders-search-icon" />
              <input
                type="text"
                className="search-input"
                style={{ paddingLeft: '34px', width: '100%' }}
                placeholder="Enter waybill tracking or /api/documents?q=..."
                value={customTracking}
                onChange={(e) => setCustomTracking(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={customRunning || !customTracking.trim()}>
              {customRunning ? <RefreshCw size={14} className="spinner" /> : <Zap size={14} />}
              Test Speed
            </button>
          </form>
        </div>

        {customResult && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-app)',
              border: '1px solid var(--border-light)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge badge-primary">GET</span>
              <code style={{ fontWeight: 700, fontSize: '0.85rem' }}>{customResult.path}</code>
              <span
                className={`badge ${
                  customResult.status >= 200 && customResult.status < 300
                    ? 'badge-emerald'
                    : customResult.status === 202
                      ? 'badge-amber'
                      : 'badge-rose'
                }`}
              >
                HTTP {customResult.status}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.85rem' }}>
              <span>
                Size: <strong>{formatBytes(customResult.size)}</strong>
              </span>
              {customResult.records !== null && (
                <span>
                  Records: <strong>{customResult.records}</strong>
                </span>
              )}
              <span>
                Time:{' '}
                <strong style={{ color: getSpeedRating(customResult.timeMs).color, fontSize: '0.95rem' }}>
                  {customResult.timeMs} ms
                </strong>
              </span>
              <span className={`badge ${getSpeedRating(customResult.timeMs).badge}`}>
                {getSpeedRating(customResult.timeMs).label}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Endpoints Speed Table */}
      <div className="card-section">
        <div className="card-section-header">
          <div>
            <h2 className="card-section-title">All Endpoints Fetch Speed Breakdown</h2>
            <p className="page-subtitle">
              Green (&lt;200ms) = Fast · Amber (200–600ms) = Moderate · Red (&gt;600ms) = Slow
            </p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Endpoint</th>
                <th>HTTP Status</th>
                <th>Payload / Records</th>
                <th>Latency (Avg)</th>
                <th>Min / Max</th>
                <th style={{ minWidth: '180px' }}>Speed Bar</th>
                <th>Last Tested</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARK_ENDPOINTS.map((ep) => {
                const res = results[ep.id];
                const isRunning = runningId === ep.id;
                const rating = getSpeedRating(res?.avgMs);
                const queryStr = Object.keys(ep.query || {}).length
                  ? `?${new URLSearchParams(ep.query).toString()}`
                  : '';
                const barWidth = res
                  ? Math.min(100, Math.max(6, Math.round((res.avgMs / summary.maxMs) * 100)))
                  : 0;

                return (
                  <tr key={ep.id}>
                    <td>
                      <span
                        className={`badge ${
                          ep.category === 'OrdersPage' ? 'badge-primary' : 'badge-secondary'
                        }`}
                      >
                        {ep.category}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{ep.name}</div>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          marginTop: '2px'
                        }}
                      >
                        {ep.method} {ep.path}
                        {queryStr}
                      </div>
                    </td>

                    <td>
                      {res ? (
                        <span
                          className={`badge ${
                            res.status >= 200 && res.status < 300
                              ? 'badge-emerald'
                              : res.status >= 300 && res.status < 500
                                ? 'badge-amber'
                                : 'badge-rose'
                          }`}
                        >
                          {res.status ? `${res.status} ${res.ok ? 'OK' : ''}` : 'ERR'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-subtle)', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>

                    <td style={{ fontSize: '0.82rem' }}>
                      {res ? (
                        <div>
                          <strong>{formatBytes(res.size)}</strong>
                          {res.records !== null && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {res.records} record{res.records === 1 ? '' : 's'}
                            </div>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td>
                      {res ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong
                            style={{
                              fontSize: '0.95rem',
                              fontFamily: 'monospace',
                              color: rating.color
                            }}
                          >
                            {res.avgMs} ms
                          </strong>
                          <span className={`badge ${rating.badge}`}>{rating.label}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-subtle)' }}>—</span>
                      )}
                    </td>

                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {res ? `${res.minMs}ms / ${res.maxMs}ms` : '—'}
                    </td>

                    <td>
                      <div
                        style={{
                          width: '100%',
                          height: '8px',
                          borderRadius: '999px',
                          background: 'var(--bg-app)',
                          border: '1px solid var(--border-light)',
                          overflow: 'hidden'
                        }}
                      >
                        <div
                          style={{
                            width: `${barWidth}%`,
                            height: '100%',
                            background: rating.color,
                            borderRadius: '999px',
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>
                    </td>

                    <td style={{ fontFamily: 'monospace', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {res?.testedAt || '—'}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                        disabled={isRunning || runningAll}
                        onClick={() => runSingleEndpoint(ep, iterations)}
                      >
                        {isRunning ? (
                          <>
                            <RefreshCw size={13} className="spinner" /> Testing
                          </>
                        ) : (
                          <>
                            <Zap size={13} /> Test
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
