import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ScanLine,
  Printer,
  AlertTriangle,
  XOctagon,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldAlert,
  Radio,
  MapPin,
  History,
  Check,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  checkBackendHealth,
  lookupWaybillScan,
  issueAtScan,
  logInvoicePrint,
  reportScanGaveUp,
  fetchDocumentDetails,
  searchDocuments,
  fetchOrderDraft,
  extractDocumentList,
  normalizeDocumentRecord,
  fetchPackingStations,
  fetchUnresolvedScans,
  resolveUnresolvedScan,
  normalizeReprintReasons,
  savePrintedInvoiceRecord
} from '../services/scanService';
import WaybillTicket from '../components/WaybillTicket';
import './pages.css';

export default function PackingScanPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('scanner');

  const [health, setHealth] = useState({ checking: true, ok: true, appEnv: null });
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');

  const reprintReasons = normalizeReprintReasons(user?.reprintReasons);
  const defaultReprintReason = reprintReasons[0]?.code || 'damaged';

  const [isScanOpen, setIsScanOpen] = useState(false);
  const [scannerState, setScannerState] = useState('IDLE'); // 'IDLE' | 'READING' | 'SUBMITTING'

  const [tracking, setTracking] = useState('');
  const [phase, setPhase] = useState('IDLE');
  const [lookupData, setLookupData] = useState(null);
  const [issueData, setIssueData] = useState(null);
  const [docDetail, setDocDetail] = useState(null);
  const [busyStep, setBusyStep] = useState(null);

  const [elapsedSec, setElapsedSec] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [printableDoc, setPrintableDoc] = useState(null);
  const [logs, setLogs] = useState(() => {
    try {
      const saved =
        localStorage.getItem('bir_recent_scan_logs') ||
        sessionStorage.getItem('bir_recent_scan_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isRecentModalOpen, setIsRecentModalOpen] = useState(false);
  const [recentPage, setRecentPage] = useState(1);
  const LOGS_PER_PAGE = 10;

  const [unresolvedList, setUnresolvedList] = useState([]);
  const [unresolvedLoading, setUnresolvedLoading] = useState(false);
  const [unresolvedErr, setUnresolvedErr] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);
  const [notes, setNotes] = useState({});

  const pollTimerRef = useRef(null);
  const tickTimerRef = useRef(null);
  const barcodeBufferRef = useRef('');
  const burstTimeoutRef = useRef(null);

  const stopTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      const h = await checkBackendHealth();
      if (active) {
        setHealth({
          checking: false,
          ok: h.ok && h.status === 200,
          appEnv: h.data?.app_env || user?.appEnv || null
        });
      }

      const assigned = Array.isArray(user?.stations) ? user.stations : [];
      if (assigned.length > 0) {
        if (active) {
          setStations(assigned);
          const first =
            typeof assigned[0] === 'string'
              ? assigned[0]
              : assigned[0]?.code || assigned[0]?.id || '';
          setSelectedStation(String(first));
        }
        return;
      }

      const res = await fetchPackingStations();
      const list = Array.isArray(res.data)
        ? res.data
        : res.data?.results || res.data?.stations || [];

      if (active && list.length > 0) {
        setStations(list);
        const firstActive = list.find((s) => s.is_active !== false) || list[0];
        setSelectedStation(String(firstActive.code || firstActive.id || ''));
      }
    }

    loadInitialData();
    return () => {
      active = false;
      stopTimers();
    };
  }, [user, stopTimers]);

  const appendLog = useCallback((item) => {
    setLogs((prev) => {
      const next = [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          time: new Date().toLocaleTimeString('en-PH', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          ...item
        },
        ...prev.slice(0, 199)
      ];
      try {
        localStorage.setItem('bir_recent_scan_logs', JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  }, []);

  const getStationPayload = useCallback(() => {
    const match = stations.find(
      (s) =>
        String(s?.code || s) === String(selectedStation) ||
        String(s?.id) === String(selectedStation)
    );
    return {
      stationId: match?.id ?? null,
      stationCode:
        typeof match === 'string' ? match : match?.code || selectedStation || ''
    };
  }, [stations, selectedStation]);

  const resetView = () => {
    stopTimers();
    setPhase('IDLE');
    setTracking('');
    setLookupData(null);
    setIssueData(null);
    setDocDetail(null);
    setElapsedSec(0);
    setRetryCount(0);
  };

  const loadDocumentInfo = useCallback(async (docId, fallbackQuery = '', orderFallback = null) => {
    let targetId = docId;
    let normalized = null;

    if (!targetId && fallbackQuery) {
      const searchRes = await searchDocuments(fallbackQuery);
      if (searchRes.ok && searchRes.data) {
        const list = extractDocumentList(searchRes.data);
        if (list.length > 0) {
          const first = normalizeDocumentRecord(list[0]);
          if (first?.id) {
            targetId = first.id;
          } else if (first) {
            normalized = first;
          }
        }
      }
    }

    if (targetId) {
      const detailRes = await fetchDocumentDetails(targetId);
      if (detailRes.ok && detailRes.data) {
        normalized = normalizeDocumentRecord({
          ...detailRes.data,
          order: detailRes.data?.order || orderFallback || undefined
        });
      }
    }

    if ((!normalized || !normalized.lines || normalized.lines.length === 0) && orderFallback) {
      const plat = orderFallback.platform || orderFallback.marketplace;
      const storeId = orderFallback.store_id || orderFallback.store_code || orderFallback.shop_id;
      const ordId = orderFallback.order_id || orderFallback.platform_order_id || orderFallback.id;

      if (plat && storeId && ordId) {
        const draftRes = await fetchOrderDraft(plat, storeId, ordId);
        if (draftRes.ok && draftRes.data) {
          const draftNorm = normalizeDocumentRecord({
            ...draftRes.data,
            order: orderFallback
          });
          if (draftNorm) {
            normalized = normalized
              ? {
                  ...normalized,
                  lines: normalized.lines?.length ? normalized.lines : draftNorm.lines,
                  productSummary:
                    normalized.productSummary !== '—'
                      ? normalized.productSummary
                      : draftNorm.productSummary,
                  vatableSales:
                    normalized.vatableSales !== '0.00'
                      ? normalized.vatableSales
                      : draftNorm.vatableSales,
                  vatAmount:
                    normalized.vatAmount !== '0.00' ? normalized.vatAmount : draftNorm.vatAmount
                }
              : draftNorm;
          }
        }
      }
    }

    if (!normalized && orderFallback) {
      normalized = normalizeDocumentRecord({ order: orderFallback });
    }

    if (normalized) {
      setDocDetail(normalized);
    }
    return normalized;
  }, []);

  const printInvoice = useCallback(
    async (doc, isReprint, code, orderInfo) => {
      const docId =
        doc?.id ||
        doc?.document_id ||
        doc?.invoice_id ||
        doc?.document_number ||
        orderInfo?.order_id ||
        code;
      if (!docId) return;

      setBusyStep('printing');
      const { stationId, stationCode } = getStationPayload();

      let res = { ok: true, data: null, printOutcome: isReprint ? 'REPRINT' : 'ORIGINAL', message: 'Printed waybill e-invoice.' };

      if (doc?.id || doc?.document_id || doc?.invoice_id || doc?.document_number) {
        res = await logInvoicePrint(docId, {
          reason: isReprint ? defaultReprintReason : null,
          note: isReprint ? 'Auto-reprint on scan' : '',
          stationId,
          stationCode
        });

        if (
          !res.ok &&
          !isReprint &&
          (res.status === 400 ||
            res.printOutcome === 'REASON_REQUIRED_400' ||
            res.printOutcome === 'CONCURRENT_REPRINT_409')
        ) {
          isReprint = true;
          res = await logInvoicePrint(docId, {
            reason: defaultReprintReason,
            note:
              res.printOutcome === 'CONCURRENT_REPRINT_409'
                ? 'Concurrent station reprint'
                : 'Auto-reprint on repeat scan',
            stationId,
            stationCode
          });
        }
      }

      setBusyStep(null);

      if (res.printOutcome === 'REFUSED_REPLACED_409') {
        appendLog({
          tracking: code,
          endpoint: `POST /api/documents/${docId}/prints`,
          status: '409 REPLACED',
          badge: 'badge-rose',
          detail: res.message
        });
        await loadDocumentInfo(docId, code, orderInfo);
        setScannerState('IDLE');
        return;
      }

      appendLog({
        tracking: code,
        endpoint: `POST /api/documents/${docId}/prints`,
        status: isReprint ? 'REPRINTED' : 'PRINTED',
        badge: 'badge-emerald',
        detail: res.message || 'Waybill E-Invoice printed and moved to Invoices Tracker.'
      });

      const fullNormalized = await loadDocumentInfo(
        doc?.id || doc?.document_id || null,
        code,
        orderInfo
      );
      const fullDoc = fullNormalized?.raw || res.data?.document || res.data?.invoice || doc || orderInfo;

      const recordToSave =
        fullNormalized ||
        normalizeDocumentRecord({
          document: fullDoc,
          order: orderInfo,
          tracking: code
        });

      if (recordToSave) {
        const ensuredRecord = {
          ...recordToSave,
          documentNumber:
            recordToSave.documentNumber && recordToSave.documentNumber !== '—'
              ? recordToSave.documentNumber
              : `EINV-${recordToSave.orderId && recordToSave.orderId !== '—' ? recordToSave.orderId : code}`
        };
        savePrintedInvoiceRecord(ensuredRecord, {
          tracking: code,
          isReprint,
          reprintReason: isReprint ? defaultReprintReason : null,
          stationCode
        });
      }

      setPrintableDoc({
        ...fullDoc,
        _normalized: fullNormalized,
        _isReprint: isReprint,
        _reprintReason: isReprint ? defaultReprintReason : null,
        _orderFallback: orderInfo
      });

      setTimeout(() => {
        window.print();
        setScannerState('IDLE');
      }, 150);
    },
    [getStationPayload, defaultReprintReason, appendLog, loadDocumentInfo]
  );

  const issueInvoice = useCallback(
    async (code, orderInfo) => {
      setBusyStep('issuing');
      const { stationId, stationCode } = getStationPayload();

      const res = await issueAtScan({
        tracking: code,
        stationId,
        stationCode
      });

      setBusyStep(null);
      setIssueData(res);

      const outcome = res.classified?.outcome;
      const inv = res.classified?.invoice;
      const ord = res.classified?.order || orderInfo;
      const fallbackQuery = ord?.order_id || ord?.id || code;

      if (outcome === 'ISSUED_NOW') {
        appendLog({
          tracking: code,
          endpoint: 'POST /api/scan/issue',
          status: 'ISSUED',
          badge: 'badge-primary',
          detail: inv?.document_number || inv?.invoice_number || `Doc #${inv?.id}`
        });
        if (inv) await printInvoice(inv, false, code, ord);
      } else if (outcome === 'ALREADY_ISSUED') {
        appendLog({
          tracking: code,
          endpoint: 'POST /api/scan/issue',
          status: 'EXISTING',
          badge: 'badge-emerald',
          detail: inv?.document_number || inv?.invoice_number || `Doc #${inv?.id}`
        });
        if (inv) await printInvoice(inv, true, code, ord);
      } else if (outcome === 'DO_NOT_SHIP_RED' || outcome === 'DO_NOT_SHIP_AMBER') {
        setPhase(outcome);
        appendLog({
          tracking: code,
          endpoint: 'POST /api/scan/issue',
          status: outcome === 'DO_NOT_SHIP_RED' ? 'DO NOT SHIP' : 'UNPAID HOLD',
          badge: outcome === 'DO_NOT_SHIP_RED' ? 'badge-rose' : 'badge-amber',
          detail: res.classified.reason
        });
        setScannerState('IDLE');
      } else if (outcome === 'AMBIGUOUS_409') {
        setPhase('AMBIGUOUS_409');
        appendLog({
          tracking: code,
          endpoint: 'POST /api/scan/issue',
          status: '409 AMBIGUOUS',
          badge: 'badge-rose',
          detail: res.classified.reason
        });
        setScannerState('IDLE');
      } else if (outcome === 'BLOCKED') {
        appendLog({
          tracking: code,
          endpoint: 'POST /api/scan/issue',
          status: 'BLOCKED',
          badge: 'badge-rose',
          detail: res.classified.reason
        });
        await loadDocumentInfo(inv?.id, fallbackQuery, ord);
        setScannerState('IDLE');
      } else {
        await loadDocumentInfo(inv?.id, fallbackQuery, ord);
        setScannerState('IDLE');
      }
    },
    [getStationPayload, appendLog, printInvoice, loadDocumentInfo]
  );

  const handleGiveUp = useCallback(
    async (code, waited = 60) => {
      stopTimers();
      const { stationId, stationCode } = getStationPayload();
      await reportScanGaveUp({
        tracking: code,
        stationId,
        stationCode,
        waitedSeconds: waited,
        note: `Timed out after ${waited}s waiting for order sync.`
      });

      setPhase('GAVE_UP_LOGGED');
      appendLog({
        tracking: code,
        endpoint: 'POST /api/scans/gave-up',
        status: 'GAVE UP',
        badge: 'badge-amber',
        detail: 'Logged to unresolved scans'
      });
    },
    [stopTimers, getStationPayload, appendLog]
  );

  const runScanRef = useRef(null);

  const runScan = useCallback(
    async (rawCode, isPoll = false) => {
      const code = (rawCode || '').trim();
      if (!code) return;

      if (!isPoll) {
        stopTimers();
        setTracking(code);
        setPhase('LOOKUP_LOADING');
        setLookupData(null);
        setIssueData(null);
        setDocDetail(null);
        setElapsedSec(0);
        setRetryCount(0);
      }

      const res = await lookupWaybillScan(code);
      setLookupData(res);

      const state = res.classified?.state;

      if (state === 'NOT_SYNCED_202') {
        setPhase('NOT_SYNCED_202');
        setScannerState('IDLE');
        if (!isPoll) {
          appendLog({
            tracking: code,
            endpoint: 'GET /api/scan/:tracking',
            status: '202 WAITING',
            badge: 'badge-amber',
            detail: 'Order not synced yet, retrying every 3s'
          });

          tickTimerRef.current = setInterval(() => {
            setElapsedSec((s) => {
              const next = s + 1;
              if (next >= 60) handleGiveUp(code, 60);
              return next;
            });
          }, 1000);

          pollTimerRef.current = setInterval(() => {
            setRetryCount((c) => c + 1);
            runScanRef.current?.(code, true);
          }, 3000);
        }
        return;
      }

      if (state === 'DB_DOWN_503') {
        setPhase('DB_DOWN_503');
        setScannerState('IDLE');
        setHealth({ checking: false, ok: false });
        if (!isPoll) {
          pollTimerRef.current = setInterval(() => {
            setRetryCount((c) => c + 1);
            runScanRef.current?.(code, true);
          }, 3000);
        }
        return;
      }

      stopTimers();
      setHealth({ checking: false, ok: true });

      if (state === 'AMBIGUOUS_409') {
        setPhase('AMBIGUOUS_409');
        setScannerState('IDLE');
        appendLog({
          tracking: code,
          endpoint: 'GET /api/scan/:tracking',
          status: '409 AMBIGUOUS',
          badge: 'badge-rose',
          detail: res.classified.message
        });
        return;
      }

      if (state === 'DO_NOT_SHIP_RED' || state === 'DO_NOT_SHIP_AMBER') {
        setPhase(state);
        setScannerState('IDLE');
        appendLog({
          tracking: code,
          endpoint: 'GET /api/scan/:tracking',
          status: state === 'DO_NOT_SHIP_RED' ? 'DO NOT SHIP' : 'UNPAID HOLD',
          badge: state === 'DO_NOT_SHIP_RED' ? 'badge-rose' : 'badge-amber',
          detail: res.classified.message
        });
        return;
      }

      if (state === 'ORDER_OK') {
        setPhase('ORDER_OK');
        appendLog({
          tracking: code,
          endpoint: 'GET /api/scan/:tracking',
          status: '200 OK',
          badge: 'badge-emerald',
          detail: res.classified.message
        });
        await issueInvoice(code, res.classified.order);
        return;
      }

      setPhase('ERROR');
      setScannerState('IDLE');
      appendLog({
        tracking: code,
        endpoint: 'GET /api/scan/:tracking',
        status: `ERROR ${res.status}`,
        badge: 'badge-rose',
        detail: res.classified?.message || 'Lookup failed'
      });
    },
    [stopTimers, appendLog, handleGiveUp, issueInvoice]
  );

  useEffect(() => {
    runScanRef.current = runScan;
  }, [runScan]);

  useEffect(() => {
    if (!isScanOpen) {
      barcodeBufferRef.current = '';
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
      return;
    }

    const submitBuffer = () => {
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
      const scanned = barcodeBufferRef.current.trim();
      barcodeBufferRef.current = '';

      if (scanned.length >= 3) {
        setScannerState('SUBMITTING');
        runScan(scanned, false);
      } else {
        setScannerState('IDLE');
      }
    };

    const onKeyDown = (e) => {
      if (scannerState === 'SUBMITTING') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsScanOpen(false);
        setScannerState('IDLE');
        barcodeBufferRef.current = '';
        return;
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (barcodeBufferRef.current.trim().length > 0) {
          e.preventDefault();
          submitBuffer();
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        barcodeBufferRef.current += e.key;
        setScannerState('READING');

        if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
        burstTimeoutRef.current = setTimeout(() => {
          if (barcodeBufferRef.current.trim().length >= 5) {
            submitBuffer();
          }
        }, 180);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
    };
  }, [isScanOpen, scannerState, runScan]);

  const loadUnresolved = useCallback(async () => {
    setUnresolvedLoading(true);
    setUnresolvedErr(null);
    const res = await fetchUnresolvedScans();
    setUnresolvedLoading(false);

    if (!res.ok) {
      setUnresolvedErr(res.data?.detail || `Failed to load (${res.status})`);
      return;
    }

    const items = Array.isArray(res.data)
      ? res.data
      : res.data?.results || res.data?.scans || [];
    setUnresolvedList(items);
  }, []);

  const handleResolve = async (scanId) => {
    const note = (notes[scanId] || '').trim();
    if (!note) return;

    setResolvingId(scanId);
    const res = await resolveUnresolvedScan(scanId, note);
    setResolvingId(null);

    if (res.ok) {
      setNotes((prev) => ({ ...prev, [scanId]: '' }));
      loadUnresolved();
    }
  };

  const activeOrder = issueData?.classified?.order || lookupData?.classified?.order || null;
  const activeInvoice =
    issueData?.classified?.invoice || lookupData?.classified?.currentInvoice || null;
  const issueOutcome = issueData?.classified?.outcome || null;

  const displayDoc =
    docDetail ||
    (activeOrder || activeInvoice
      ? normalizeDocumentRecord({ document: activeInvoice, order: activeOrder })
      : null);

  const displayLines =
    displayDoc?.lines && displayDoc.lines.length > 0
      ? displayDoc.lines
      : displayDoc
        ? [
            {
              id: 1,
              productName:
                displayDoc.productSummary !== '—'
                  ? displayDoc.productSummary
                  : `${displayDoc.platform} Order #${displayDoc.orderId}`,
              sku: '',
              qty: 1,
              unitPrice: displayDoc.totalAmount,
              vatAmount: displayDoc.vatAmount,
              lineTotal: displayDoc.totalAmount
            }
          ]
        : [];

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="page-title">Packing Scan Station</h1>
            <span className={`badge ${health.ok ? 'badge-emerald' : 'badge-rose'}`}>
              <Radio size={12} style={{ marginRight: '4px' }} />
              {health.checking ? 'Checking...' : health.ok ? 'Online' : 'Offline'}
            </span>
            {(health.appEnv || user?.appEnv) === 'staging' && (
              <span className="badge badge-amber">STAGING ENV</span>
            )}
          </div>
          <p className="page-subtitle">
            Scan parcel waybills to issue and print BIR-compliant e-invoices.
          </p>
        </div>

        <div className="page-actions">
          <div className="station-pill">
            <MapPin size={15} style={{ color: 'var(--primary)' }} />
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Station:</span>
            {stations.length > 0 ? (
              <select
                className="station-select"
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
              >
                {stations.map((st, i) => {
                  const code = typeof st === 'string' ? st : st.code || st.id || `STN-${i + 1}`;
                  const label =
                    typeof st === 'string'
                      ? st
                      : st.name
                        ? `${st.code || st.id} — ${st.name}`
                        : st.code || st.id;
                  return (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  );
                })}
              </select>
            ) : (
              <strong>No Station</strong>
            )}
          </div>

          <div className="scan-mode-switch">
            <button
              type="button"
              onClick={() => setActiveTab('scanner')}
              className={`btn scan-mode-btn ${activeTab === 'scanner' ? 'active' : ''}`}
            >
              <ScanLine size={15} /> Scanner
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('unresolved');
                loadUnresolved();
              }}
              className={`btn scan-mode-btn ${activeTab === 'unresolved' ? 'active' : ''}`}
            >
              <AlertTriangle size={15} /> Unresolved Scans
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'unresolved' ? (
        <div className="card-section no-print">
          <div className="card-section-header">
            <div>
              <h2 className="card-section-title">Unresolved Scans</h2>
              <p className="page-subtitle">
                Timed-out or failed scans that need an resolution note.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={loadUnresolved}
              disabled={unresolvedLoading}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>

          {unresolvedErr && <p style={{ color: '#e11d48', marginBottom: '12px' }}>{unresolvedErr}</p>}

          {unresolvedLoading ? (
            <p style={{ padding: '24px 0', color: 'var(--text-muted)' }}>Loading...</p>
          ) : unresolvedList.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <CheckCircle2 size={32} style={{ color: 'var(--accent-emerald)', margin: '0 auto 8px' }} />
              <div>No unresolved scans found.</div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Waybill</th>
                    <th>Status</th>
                    <th>Station</th>
                    <th>Resolution Note</th>
                  </tr>
                </thead>
                <tbody>
                  {unresolvedList.map((sc) => {
                    const id = sc.id || sc.scan_id;
                    return (
                      <tr key={id}>
                        <td>#{id}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {sc.tracking || sc.waybill || '—'}
                        </td>
                        <td>
                          <span className="badge badge-rose">
                            {sc.status || sc.failure_type || 'UNRESOLVED'}
                          </span>
                        </td>
                        <td>{sc.station_code || sc.station || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              placeholder="Add resolution note..."
                              value={notes[id] || ''}
                              onChange={(e) =>
                                setNotes((prev) => ({ ...prev, [id]: e.target.value }))
                              }
                              style={{
                                flex: 1,
                                padding: '6px 10px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-light)',
                                background: 'var(--bg-app)',
                                color: 'var(--text-main)'
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={resolvingId === id || !(notes[id] || '').trim()}
                              onClick={() => handleResolve(id)}
                            >
                              <Check size={14} /> Resolve
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="no-print">
          <div className="card-section scan-trigger-banner">
            <div className="scan-trigger-left">
              <div className="scan-trigger-icon">
                <ScanLine size={26} />
              </div>
              <div>
                <h2 className="card-section-title" style={{ fontSize: '1.15rem' }}>
                  Waybill Barcode Scanner
                </h2>
                <p className="page-subtitle">
                  Click Scan Waybill and scan the parcel barcode to automatically issue and print the invoice.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-primary scan-btn-lg"
                onClick={() => {
                  barcodeBufferRef.current = '';
                  setScannerState('IDLE');
                  setIsScanOpen(true);
                }}
              >
                <ScanLine size={18} /> Scan Waybill
              </button>

              {phase !== 'IDLE' && (
                <button type="button" className="btn btn-outline" onClick={resetView}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {phase === 'LOOKUP_LOADING' && (
            <div className="card-section" style={{ textAlign: 'center', padding: '40px' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 700 }}>Processing waybill {tracking}...</div>
            </div>
          )}

          {phase === 'NOT_SYNCED_202' && (
            <div className="card-section scan-alert-card scan-alert-amber">
              <Clock size={28} style={{ color: '#d97706', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span className="badge badge-amber">202 · Waiting for Sync ({elapsedSec}s / 60s)</span>
                <h3 style={{ marginTop: '6px', fontWeight: 700 }}>
                  Order {tracking} is not synced yet
                </h3>
                <p className="page-subtitle">{lookupData?.classified?.message}</p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => runScan(tracking, true)}
                  >
                    <RefreshCw size={14} /> Retry Now
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleGiveUp(tracking, elapsedSec || 60)}
                  >
                    Report Gave-Up
                  </button>
                </div>
              </div>
            </div>
          )}

          {phase === 'GAVE_UP_LOGGED' && (
            <div className="card-section scan-alert-card scan-alert-amber">
              <AlertTriangle size={26} style={{ color: '#d97706', flexShrink: 0 }} />
              <div>
                <span className="badge badge-amber">Logged to Unresolved Scans</span>
                <h3 style={{ marginTop: '6px', fontWeight: 700 }}>
                  Waybill {tracking} timed out — set parcel aside
                </h3>
              </div>
            </div>
          )}

          {phase === 'DB_DOWN_503' && (
            <div className="card-section scan-alert-card scan-alert-red">
              <ShieldAlert size={28} style={{ color: '#dc2626', flexShrink: 0 }} />
              <div>
                <span className="badge badge-rose">503 · Database Unavailable</span>
                <h3 style={{ marginTop: '6px', fontWeight: 700 }}>
                  Retrying connection every 3 seconds (Attempt #{retryCount})
                </h3>
              </div>
            </div>
          )}

          {(phase === 'AMBIGUOUS_409' || phase === 'DO_NOT_SHIP_RED' || phase === 'ERROR') && (
            <div className="card-section scan-alert-card scan-alert-red">
              <XOctagon size={30} style={{ color: '#dc2626', flexShrink: 0 }} />
              <div>
                <span className="badge badge-rose">{lookupData?.classified?.title}</span>
                <h3 style={{ marginTop: '6px', fontWeight: 800, color: '#dc2626' }}>
                  {lookupData?.classified?.message}
                </h3>
              </div>
            </div>
          )}

          {phase === 'DO_NOT_SHIP_AMBER' && (
            <div className="card-section scan-alert-card scan-alert-amber">
              <AlertTriangle size={30} style={{ color: '#d97706', flexShrink: 0 }} />
              <div>
                <span className="badge badge-amber">{lookupData?.classified?.title}</span>
                <h3 style={{ marginTop: '6px', fontWeight: 800, color: '#b45309' }}>
                  {lookupData?.classified?.message}
                </h3>
              </div>
            </div>
          )}

          {phase === 'ORDER_OK' && (
            <div className="cards-grid-2" style={{ marginBottom: '24px' }}>
              <div className="card-section" style={{ marginBottom: 0 }}>
                <div className="card-section-header">
                  <h2 className="card-section-title">Order Waybill & E-Invoice Slip</h2>
                  <span className="badge badge-emerald">100×150mm Waybill Format</span>
                </div>

                <WaybillTicket
                  platform={displayDoc?.platform || activeOrder?.platform || 'Marketplace'}
                  storeName={
                    displayDoc?.storeName ||
                    activeOrder?.store_name ||
                    activeOrder?.store_id ||
                    'Official Store'
                  }
                  copyTag={issueOutcome === 'ALREADY_ISSUED' ? 'REPRINT' : 'ORIGINAL'}
                  invoiceNumber={
                    activeInvoice?.document_number ||
                    activeInvoice?.invoice_number ||
                    displayDoc?.documentNumber ||
                    (activeInvoice?.id ? `DOC-${activeInvoice.id}` : 'PENDING')
                  }
                  issuedAt={activeInvoice?.issued_at || displayDoc?.issuedAt || ''}
                  orderId={
                    displayDoc?.orderId && displayDoc.orderId !== '—'
                      ? displayDoc.orderId
                      : activeOrder?.order_id || activeOrder?.id || '—'
                  }
                  buyerName={
                    displayDoc?.buyerName || activeOrder?.buyer_name || 'Marketplace Buyer'
                  }
                  buyerTin={displayDoc?.buyerTin || '—'}
                  orderStatus={String(
                    activeOrder?.status ||
                      activeOrder?.platform_status ||
                      displayDoc?.status ||
                      'PAID'
                  ).toUpperCase()}
                  lines={displayLines}
                  discountAmount={displayDoc?.discountAmount || '0.00'}
                  vatableSales={displayDoc?.vatableSales || '0.00'}
                  vatAmount={displayDoc?.vatAmount || '0.00'}
                  vatExemptSales={displayDoc?.vatExemptSales || '0.00'}
                  zeroRatedSales={displayDoc?.zeroRatedSales || '0.00'}
                  totalAmount={
                    displayDoc?.totalAmount ||
                    activeOrder?.total_amount ||
                    activeInvoice?.total_amount ||
                    '0.00'
                  }
                />
              </div>

              <div className="card-section" style={{ marginBottom: 0 }}>
                <div className="card-section-header">
                  <h2 className="card-section-title">E-Invoice Status</h2>
                  {docDetail?.prints?.length > 0 && (
                    <span className="badge badge-primary">
                      {docDetail.prints.length} Print{docDetail.prints.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {busyStep && (
                  <div style={{ padding: '24px', textAlign: 'center' }}>
                    <div className="spinner" style={{ margin: '0 auto 10px' }} />
                    <div>
                      {busyStep === 'issuing' ? 'Issuing invoice...' : 'Preparing printout...'}
                    </div>
                  </div>
                )}

                {!busyStep && issueOutcome === 'BLOCKED' && (
                  <div>
                    <div className="scan-alert-card scan-alert-red" style={{ borderRadius: '8px', marginBottom: '14px' }}>
                      <XOctagon size={24} style={{ color: '#dc2626', flexShrink: 0 }} />
                      <div>
                        <span className="badge badge-rose">Blocked</span>
                        <div style={{ fontWeight: 700, marginTop: '6px' }}>
                          {issueData?.classified?.reason}
                        </div>
                      </div>
                    </div>
                    {displayDoc && (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() =>
                            printInvoice(
                              activeInvoice || displayDoc,
                              false,
                              tracking,
                              activeOrder || displayDoc
                            )
                          }
                        >
                          <Printer size={16} /> Print Waybill E-Invoice
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            barcodeBufferRef.current = '';
                            setScannerState('IDLE');
                            setIsScanOpen(true);
                          }}
                        >
                          <ScanLine size={16} /> Scan Next
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!busyStep &&
                  (issueOutcome === 'ISSUED_NOW' || issueOutcome === 'ALREADY_ISSUED') &&
                  activeInvoice && (
                    <div>
                      <div
                        className={`invoice-status-box ${
                          issueOutcome === 'ISSUED_NOW' ? 'issued-now' : ''
                        }`}
                      >
                        <span
                          className={`badge ${
                            issueOutcome === 'ISSUED_NOW' ? 'badge-primary' : 'badge-emerald'
                          }`}
                        >
                          {issueOutcome === 'ISSUED_NOW' ? 'Issued & Printed' : 'Reprinted'}
                        </span>
                        <div className="invoice-number-display">
                          {activeInvoice.document_number ||
                            activeInvoice.invoice_number ||
                            docDetail?.documentNumber ||
                            `DOC-${activeInvoice.id}`}
                        </div>
                        <div className="page-subtitle" style={{ marginTop: '6px' }}>
                          Document ID: {activeInvoice.id} ·{' '}
                          {activeInvoice.issued_at || docDetail?.issuedAt || ''}
                        </div>

                        {(docDetail?.replaces || docDetail?.replacedBy) && (
                          <div className="doc-lineage-row">
                            {docDetail.replaces && (
                              <span className="badge badge-amber">
                                Replaces:{' '}
                                {typeof docDetail.replaces === 'object'
                                  ? docDetail.replaces.document_number || docDetail.replaces.id
                                  : docDetail.replaces}
                              </span>
                            )}
                            {docDetail.replacedBy && (
                              <span className="badge badge-rose">
                                Replaced By:{' '}
                                {typeof docDetail.replacedBy === 'object'
                                  ? docDetail.replacedBy.document_number || docDetail.replacedBy.id
                                  : docDetail.replacedBy}
                              </span>
                            )}
                          </div>
                        )}

                        {docDetail?.creditNotes?.length > 0 && (
                          <div className="doc-lineage-row">
                            <span className="badge badge-amber">
                              Credit Notes: {docDetail.creditNotes.length}
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            barcodeBufferRef.current = '';
                            setScannerState('IDLE');
                            setIsScanOpen(true);
                          }}
                        >
                          <ScanLine size={16} /> Scan Next
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() =>
                            printInvoice(
                              activeInvoice,
                              issueOutcome === 'ALREADY_ISSUED',
                              tracking,
                              activeOrder
                            )
                          }
                        >
                          <Printer size={16} /> Print Again
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}

          <div className="card-section">
            <div className="card-section-header" style={{ marginBottom: 0 }}>
              <div>
                <h2 className="card-section-title">
                  <History size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  Recent Scan Activity
                </h2>
                <p className="page-subtitle">
                  {logs.length === 0
                    ? 'No scans recorded in this session yet.'
                    : `${logs.length} scan event${logs.length > 1 ? 's' : ''} recorded in this session.`}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setRecentPage(1);
                  setIsRecentModalOpen(true);
                }}
              >
                <History size={15} /> View Recent Scans {logs.length > 0 ? `(${logs.length})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {isRecentModalOpen &&
        (() => {
          const totalPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
          const safePage = Math.min(recentPage, totalPages);
          const startIdx = (safePage - 1) * LOGS_PER_PAGE;
          const pageItems = logs.slice(startIdx, startIdx + LOGS_PER_PAGE);

          return (
            <div
              className="scan-modal-backdrop no-print"
              onClick={() => setIsRecentModalOpen(false)}
            >
              <div className="doc-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="doc-modal-header">
                  <div>
                    <h2 className="card-section-title" style={{ fontSize: '1.15rem' }}>
                      <History size={17} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                      Recent Scan Activity
                    </h2>
                    <p className="page-subtitle">
                      Session log of scanned waybills, API status, and print outcomes (10 items per page).
                    </p>
                  </div>
                  <button
                    type="button"
                    className="scan-modal-close"
                    style={{ position: 'static' }}
                    onClick={() => setIsRecentModalOpen(false)}
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>

                {logs.length === 0 ? (
                  <p className="page-subtitle" style={{ textAlign: 'center', padding: '32px 0' }}>
                    No scans recorded in this session yet.
                  </p>
                ) : (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Waybill</th>
                          <th>Endpoint</th>
                          <th>Status</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((row) => (
                          <tr key={row.id}>
                            <td style={{ fontFamily: 'monospace' }}>{row.time}</td>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                              {row.tracking}
                            </td>
                            <td>
                              <code>{row.endpoint}</code>
                            </td>
                            <td>
                              <span className={`badge ${row.badge}`}>{row.status}</span>
                            </td>
                            <td>{row.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="modal-pagination-bar">
                  <span className="page-subtitle">
                    {logs.length === 0
                      ? 'Showing 0 of 0 scans (10 per page)'
                      : `Showing ${startIdx + 1}–${Math.min(startIdx + LOGS_PER_PAGE, logs.length)} of ${logs.length} scans`}
                  </span>

                  <div className="modal-pagination-controls">
                    <button
                      type="button"
                      className="btn btn-outline pagination-btn"
                      disabled={safePage <= 1}
                      onClick={() => setRecentPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        className={`btn pagination-btn ${
                          pageNum === safePage ? 'btn-primary' : 'btn-outline'
                        }`}
                        onClick={() => setRecentPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    ))}

                    <button
                      type="button"
                      className="btn btn-outline pagination-btn"
                      disabled={safePage >= totalPages}
                      onClick={() => setRecentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {isScanOpen && (
        <div
          className="scan-modal-backdrop no-print"
          onClick={() => {
            if (scannerState !== 'SUBMITTING') setIsScanOpen(false);
          }}
        >
          <div className="scan-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="scan-modal-close"
              onClick={() => setIsScanOpen(false)}
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className={`scan-pulse-box ${scannerState !== 'IDLE' ? 'active' : ''}`}>
              <ScanLine size={40} />
            </div>

            <span
              className={`badge ${
                scannerState !== 'IDLE' ? 'badge-emerald' : 'badge-primary'
              }`}
            >
              {scannerState === 'SUBMITTING'
                ? 'Processing & Printing...'
                : scannerState === 'READING'
                  ? 'Reading Barcode...'
                  : 'Ready to Scan'}
            </span>

            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '10px 0 6px' }}>
              Waybill Scanner
            </h2>

            {tracking && scannerState === 'IDLE' && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-light)',
                  marginBottom: '16px',
                  textAlign: 'left',
                  fontSize: '0.82rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Last Scanned:</span>
                  <strong style={{ fontFamily: 'monospace' }}>{tracking}</strong>
                </div>
                {displayDoc && (
                  <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-light)' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Product: </span>
                      <strong>
                        {displayLines.length > 0
                          ? displayLines
                              .map((l) => `${l.productName}${l.qty > 1 ? ` (x${l.qty})` : ''}`)
                              .join(', ')
                          : displayDoc.productSummary}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                      <span>
                        12% VAT: <strong>₱{displayDoc.vatAmount}</strong>
                      </span>
                      <span>
                        Total: <strong style={{ color: 'var(--primary)' }}>₱{displayDoc.totalAmount}</strong>
                      </span>
                    </div>
                  </div>
                )}
                {activeInvoice && (
                  <div style={{ marginTop: '6px', color: 'var(--accent-emerald)', fontWeight: 700 }}>
                    ✓ Printed {activeInvoice.document_number || activeInvoice.invoice_number || `DOC-${activeInvoice.id}`}
                  </div>
                )}
                {issueOutcome === 'BLOCKED' && (
                  <div style={{ marginTop: '4px', color: '#dc2626', fontWeight: 600 }}>
                    ✕ Blocked: {issueData?.classified?.reason}
                  </div>
                )}
                {(phase === 'DO_NOT_SHIP_RED' ||
                  phase === 'DO_NOT_SHIP_AMBER' ||
                  phase === 'AMBIGUOUS_409' ||
                  phase === 'ERROR') && (
                  <div style={{ marginTop: '4px', color: '#dc2626', fontWeight: 600 }}>
                    ✕ {lookupData?.classified?.message}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className="btn btn-outline"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setIsScanOpen(false)}
            >
              Done Scanning (Esc)
            </button>
          </div>
        </div>
      )}

      {printableDoc && (
        <div id="bir-printable-invoice-slip" className="print-only-slip">
          <WaybillTicket
            platform={
              printableDoc._normalized?.platform ||
              printableDoc._orderFallback?.platform ||
              displayDoc?.platform ||
              'Marketplace'
            }
            storeName={
              printableDoc._normalized?.storeName ||
              printableDoc._orderFallback?.store_name ||
              displayDoc?.storeName ||
              'Official Store'
            }
            copyTag={printableDoc._isReprint ? 'REPRINT' : 'ORIGINAL'}
            invoiceNumber={
              printableDoc._normalized?.documentNumber ||
              printableDoc.document_number ||
              printableDoc.invoice_number ||
              printableDoc.id
            }
            issuedAt={printableDoc._normalized?.issuedAt || printableDoc.issued_at || ''}
            orderId={
              printableDoc._normalized?.orderId ||
              printableDoc.order_id ||
              printableDoc._orderFallback?.order_id ||
              '—'
            }
            buyerName={
              printableDoc._normalized?.buyerName ||
              printableDoc.buyer_name ||
              printableDoc._orderFallback?.buyer_name ||
              'Marketplace Buyer'
            }
            buyerTin={printableDoc._normalized?.buyerTin || displayDoc?.buyerTin || '—'}
            orderStatus={String(
              printableDoc._orderFallback?.status ||
                printableDoc._normalized?.status ||
                displayDoc?.status ||
                'PAID'
            ).toUpperCase()}
            lines={
              printableDoc._normalized?.lines && printableDoc._normalized.lines.length > 0
                ? printableDoc._normalized.lines
                : displayLines
            }
            discountAmount={
              printableDoc._normalized?.discountAmount || displayDoc?.discountAmount || '0.00'
            }
            vatableSales={
              printableDoc._normalized?.vatableSales || displayDoc?.vatableSales || '0.00'
            }
            vatAmount={
              printableDoc._normalized?.vatAmount || displayDoc?.vatAmount || '0.00'
            }
            vatExemptSales={
              printableDoc._normalized?.vatExemptSales || displayDoc?.vatExemptSales || '0.00'
            }
            zeroRatedSales={
              printableDoc._normalized?.zeroRatedSales || displayDoc?.zeroRatedSales || '0.00'
            }
            totalAmount={
              printableDoc._normalized?.totalAmount ||
              printableDoc.total_amount ||
              printableDoc._orderFallback?.total_amount ||
              displayDoc?.totalAmount ||
              '0.00'
            }
          />
        </div>
      )}
    </div>
  );
}

