import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X, LogOut } from 'lucide-react';
import '../components/feedback/notifications.css';

const NotificationContext = createContext(null);

const TOAST_ICONS = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
  info: Info
};

const DEFAULT_TITLES = {
  success: 'Success',
  danger: 'Error',
  warning: 'Warning',
  info: 'Notice'
};

let toastSeq = 0;

/* -------------------------------------------------------------------------- */
/*  Toast item                                                                */
/* -------------------------------------------------------------------------- */
function Toast({ toast, onClose }) {
  const Icon = TOAST_ICONS[toast.type] || Info;
  const [leaving, setLeaving] = useState(false);

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onClose(toast.id), 220);
  }, [onClose, toast.id]);

  useEffect(() => {
    if (!toast.duration) return undefined;
    const t = setTimeout(close, toast.duration);
    return () => clearTimeout(t);
  }, [close, toast.duration]);

  return (
    <div
      className={`toast toast-${toast.type} ${leaving ? 'toast-leave' : ''}`}
      role={toast.type === 'danger' ? 'alert' : 'status'}
    >
      <div className="toast-icon">
        <Icon size={18} />
      </div>
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <button className="toast-close" onClick={close} aria-label="Dismiss notification">
        <X size={15} />
      </button>
      {toast.duration > 0 && (
        <span
          className="toast-progress"
          style={{ animationDuration: `${toast.duration}ms` }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Confirm dialog                                                            */
/* -------------------------------------------------------------------------- */
function ConfirmDialog({ options, onResolve }) {
  const confirmBtnRef = useRef(null);
  const variant = options.variant || 'danger';
  const Icon = options.icon || (variant === 'danger' ? LogOut : TOAST_ICONS[variant] || Info);

  useEffect(() => {
    confirmBtnRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onResolve(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResolve]);

  return (
    <div className="confirm-overlay" onMouseDown={() => onResolve(false)}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={`confirm-icon confirm-icon-${variant}`}>
          <Icon size={24} />
        </div>
        <h2 id="confirm-dialog-title" className="confirm-title">
          {options.title || 'Are you sure?'}
        </h2>
        {options.message && <p className="confirm-message">{options.message}</p>}
        <div className="confirm-actions">
          <button
            id="confirm-dialog-cancel"
            className="confirm-btn confirm-btn-cancel"
            onClick={() => onResolve(false)}
          >
            {options.cancelText || 'Cancel'}
          </button>
          <button
            id="confirm-dialog-confirm"
            ref={confirmBtnRef}
            className={`confirm-btn confirm-btn-${variant}`}
            onClick={() => onResolve(true)}
          >
            {options.confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */
export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const removeToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, title, message, opts = {}) => {
    const id = ++toastSeq;
    setToasts((list) => [
      ...list.slice(-4), // keep at most 5 on screen
      {
        id,
        type,
        title: title || DEFAULT_TITLES[type],
        message,
        duration: opts.duration ?? (type === 'danger' ? 6000 : 4000)
      }
    ]);
    return id;
  }, []);

  const notify = React.useMemo(
    () => ({
      success: (title, message, opts) => push('success', title, message, opts),
      danger: (title, message, opts) => push('danger', title, message, opts),
      warning: (title, message, opts) => push('warning', title, message, opts),
      info: (title, message, opts) => push('info', title, message, opts),
      dismiss: removeToast
    }),
    [push, removeToast]
  );

  /** Returns a Promise<boolean> — true if the user confirmed. */
  const confirm = useCallback(
    (options = {}) =>
      new Promise((resolve) => {
        setConfirmState({ options, resolve });
      }),
    []
  );

  const resolveConfirm = useCallback(
    (result) => {
      setConfirmState((state) => {
        state?.resolve(result);
        return null;
      });
    },
    []
  );

  return (
    <NotificationContext.Provider value={{ notify, confirm }}>
      {children}

      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={removeToast} />
        ))}
      </div>

      {confirmState && (
        <ConfirmDialog options={confirmState.options} onResolve={resolveConfirm} />
      )}
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotify must be used within a NotificationProvider');
  return ctx.notify;
}

export function useConfirm() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useConfirm must be used within a NotificationProvider');
  return ctx.confirm;
}
