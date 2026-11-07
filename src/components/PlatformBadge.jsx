import React from 'react';

export default function PlatformBadge({
  platform,
  status,
  printed = false,
  hideStatus = false,
  style,
  className = ''
}) {
  const raw = String(platform || 'Marketplace').trim();
  const lower = raw.toLowerCase();

  let badgeClass = 'badge-other-light';
  let displayLabel = raw;
  let icon = <span className="mp-dot" />;
  let resolvedStatus = status ? String(status).trim().toUpperCase() : '';

  if (lower.includes('shopee')) {
    badgeClass = 'badge-shopee-solid';
    displayLabel = 'Shopee';
    icon = <span className="mp-dot" style={{ background: '#ffffff' }} />;
    if (!resolvedStatus) {
      resolvedStatus = 'RTS';
    }
  } else if (lower.includes('tiktok')) {
    displayLabel = 'TikTok Shop';
    const isPrinted =
      printed ||
      resolvedStatus === 'PRINTED' ||
      resolvedStatus === 'ISSUED' ||
      resolvedStatus === 'BIR STAMPED';

    if (isPrinted) {
      badgeClass = 'badge-tiktok-dark';
      icon = <span className="mp-dot" />;
      if (!status || resolvedStatus === 'ISSUED' || resolvedStatus === 'BIR STAMPED') {
        resolvedStatus = 'PRINTED';
      }
    } else {
      badgeClass = 'badge-tiktok-light';
      icon = (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.86.12V9.42a6.33 6.33 0 0 0-.86-.06 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V9.05a8.27 8.27 0 0 0 4.78 1.48V7.1a4.83 4.83 0 0 1-1.04-.41z" />
        </svg>
      );
      if (!resolvedStatus) {
        resolvedStatus = 'DUE';
      }
    }
  } else if (lower.includes('lazada')) {
    badgeClass = 'badge-lazada-solid';
    displayLabel = 'Lazada';
    icon = <span className="mp-dot" style={{ background: '#f3006a' }} />;
    if (!resolvedStatus) {
      resolvedStatus = 'PACKED';
    }
  }

  return (
    <span
      className={`mp-badge ${badgeClass} font-curvy ${className}`.trim()}
      style={style}
    >
      {icon}
      {displayLabel}
      {!hideStatus && resolvedStatus ? (
        <span className="status-suffix">{resolvedStatus}</span>
      ) : null}
    </span>
  );
}
