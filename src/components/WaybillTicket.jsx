import React from 'react';
import { SLIP_TEXT, platformName } from '../config/invoicePrint';

export default function WaybillTicket({
  platform,
  storeName,
  copyTag,
  invoiceNumber,
  issuedAt,
  orderId,
  lines,
  discountAmount,
  vatableSales,
  vatAmount,
  vatExemptSales,
  zeroRatedSales,
  totalAmount,
  // Odoo e-invoices / credit notes only: the real buyer and the Odoo number(s) as reference lines
  showBuyer = false,
  buyerName,
  buyerTin,
  buyerBranchCode,
  buyerAddress,
  referenceLines = [],
  // Buyer portal: QR code (SVG text from the backend, portal_qr_svg) that opens the invoice online
  portalQrSvg,
  // Backend printout rules (document response `printout`, 2026-11-25). When given, the buyer block always prints:
  // with the stored buyer (reissued / Odoo invoices) or blank (generic marketplace buyer such as "Shopee Buyer").
  printout,
  // Information only, below the total and outside the VAT figures; omitted when unknown
  buyerPaidAmount,
  platformVoucherAmount
}) {
  const ruled = printout && printout.buyer ? printout.buyer : null;
  const buyerShown = ruled ? true : showBuyer;
  const soldTo = ruled ? (ruled.show ? ruled.name : '') : (buyerName || '—');
  const soldAddress = ruled ? (ruled.show ? ruled.address : '') : (buyerAddress || '—');
  const tinBranch = ruled
    ? (ruled.show ? ruled.tin_branch : '')
    : ([buyerTin, buyerBranchCode].filter((v) => v && v !== '—').join(' - ') || '—');
  // Payment information lines (2026-11-27): ready-made by the backend from invoicing.order_payment_info (labels in
  // portal/texts.py PAYMENT_TEXTS, so the slip and the buyer page say the same). Without them (draft preview, scan
  // screen before issuing) the slip falls back to the single amounts passed in.
  const readyLines = Array.isArray(printout?.payment_lines) ? printout.payment_lines : null;
  const paid = buyerPaidAmount ?? printout?.buyer_paid_amount ?? null;
  const voucher = platformVoucherAmount ?? printout?.platform_voucher_amount ?? null;
  const infoLines = readyLines && readyLines.length > 0
    ? readyLines.map((l) => ({ key: l.key, label: l.label, amount: l.amount }))
    : [
      voucher != null && {
        key: 'platform_voucher',
        label: SLIP_TEXT.platformVoucher.replace('{platform}', platformName(platform)),
        amount: voucher
      },
      paid != null && { key: 'buyer_paid', label: SLIP_TEXT.buyerPaid, amount: paid }
    ].filter(Boolean);
  return (
    <div className="waybill-sheet">
      <div className="waybill-top-bar">
        <span className="waybill-channel-tag">{platform || 'MARKETPLACE'}</span>
        <span style={{ fontWeight: 800, fontSize: '0.74rem' }}>
          {storeName || 'Official Store'}
        </span>
        <span className="waybill-copy-tag">{copyTag || 'ORIGINAL'}</span>
      </div>

      <div className="waybill-seller-box">
        <div className="waybill-seller-name">IPOLYMER SOLUTIONS CORP.</div>
        <div className="waybill-seller-addr">
          346 General Luis ST., Bagbaguin, Barangay 165, District 1, 1400 City of Caloocan , NCR, Third District, Philippines
        </div>
      </div>

      <div className="waybill-meta-grid">
        <div className="waybill-meta-cell">
          <div className="waybill-cell-label">Order ID</div>
          <div className="waybill-cell-val" style={{ fontFamily: 'monospace' }}>
            {orderId || '—'}
          </div>
        </div>
        <div className="waybill-meta-cell">
          <div className="waybill-cell-label">Invoice No.</div>
          <div className="waybill-cell-val" style={{ fontFamily: 'monospace' }}>
            {invoiceNumber || 'PENDING'}
          </div>
        </div>
        {issuedAt && issuedAt !== '—' && (
          <div className="waybill-meta-cell full-row">
            <div className="waybill-cell-label">Date & Time Issued</div>
            <div className="waybill-cell-val">{issuedAt}</div>
          </div>
        )}
        {referenceLines.length > 0 && (
          <div className="waybill-meta-cell full-row">
            {referenceLines.map((line) => (
              <div key={line} className="waybill-cell-val" style={{ fontFamily: 'monospace' }}>{line}</div>
            ))}
          </div>
        )}
      </div>

      {buyerShown && (
        <div className="waybill-meta-grid">
          <div className="waybill-meta-cell full-row">
            <div className="waybill-cell-label">{SLIP_TEXT.soldTo}</div>
            <div className="waybill-cell-val">{soldTo || ' '}</div>
          </div>
          <div className="waybill-meta-cell full-row">
            <div className="waybill-cell-label">{SLIP_TEXT.address}</div>
            <div className="waybill-cell-val">{soldAddress || ' '}</div>
          </div>
          <div className="waybill-meta-cell full-row">
            <div className="waybill-cell-label">{SLIP_TEXT.tinBranch}</div>
            <div className="waybill-cell-val" style={{ fontFamily: 'monospace' }}>{tinBranch || ' '}</div>
          </div>
        </div>
      )}

      <div className="waybill-items-box">
        <div className="waybill-section-tag">
          Product Ordered ({Array.isArray(lines) ? lines.length : 0})
        </div>
        <table className="waybill-items-table">
          <thead>
            <tr>
              <th>Item / SKU</th>
              <th style={{ textAlign: 'center' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(Array.isArray(lines) ? lines : []).map((ln, idx) => (
              <tr key={ln.id || idx}>
                <td>
                  <strong>
                    {ln.productName ||
                      ln.description ||
                      ln.item_name ||
                      ln.product_name ||
                      ln.sku ||
                      'Product Item'}
                  </strong>
                  {ln.sku && (
                    <div style={{ fontSize: '0.62rem', color: '#475569', fontFamily: 'monospace' }}>
                      SKU: {ln.sku}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>
                  {ln.qty ?? ln.quantity ?? 1}
                </td>
                <td style={{ textAlign: 'right' }}>
                  ₱{ln.unitPrice ?? ln.unit_price ?? ln.price ?? '0.00'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800 }}>
                  ₱{ln.grossAmount ?? ln.lineTotal ?? ln.line_total ?? ln.total ?? '0.00'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="waybill-tax-box">
        <div className="waybill-tax-row">
          <span>{SLIP_TEXT.discount}:</span>
          <strong>-₱{discountAmount || '0.00'}</strong>
        </div>
        <div className="waybill-tax-row">
          <span>VATable Sales (Net):</span>
          <strong>₱{vatableSales || '0.00'}</strong>
        </div>
        <div className="waybill-tax-row">
          <span>VAT Amount (12%):</span>
          <strong>₱{vatAmount || '0.00'}</strong>
        </div>
        <div className="waybill-tax-row">
          <span>VAT-Exempt Sales:</span>
          <span>₱{vatExemptSales || '0.00'}</span>
        </div>
        <div className="waybill-tax-row">
          <span>Zero-Rated Sales:</span>
          <span>₱{zeroRatedSales || '0.00'}</span>
        </div>
      </div>

      <div className="waybill-total-bar">
        <span>TOTAL AMOUNT (PHP)</span>
        <span>₱{totalAmount || '0.00'}</span>
      </div>

      {infoLines.length > 0 && (
        <div className="waybill-info-box">
          <div className="waybill-info-title">{SLIP_TEXT.paymentTitle}</div>
          {infoLines.map((line) => (
            <div className="waybill-tax-row" key={line.key}>
              <span>{line.label}:</span>
              <span>₱{line.amount}</span>
            </div>
          ))}
        </div>
      )}

      {portalQrSvg && (
        <div className="waybill-portal-box">
          <img
            className="waybill-portal-qr"
            alt="QR code: view this invoice online"
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(portalQrSvg)}`}
          />
          <div className="waybill-portal-text">
            <strong>{SLIP_TEXT.portalTitle}</strong>
            <span>{SLIP_TEXT.portalHint}</span>
          </div>
        </div>
      )}
    </div>
  );
}

