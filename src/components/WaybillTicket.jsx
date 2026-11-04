import React from 'react';

export default function WaybillTicket({
  platform,
  storeName,
  copyTag,
  invoiceNumber,
  issuedAt,
  orderId,
  buyerName,
  buyerTin,
  orderStatus,
  lines,
  discountAmount,
  vatableSales,
  vatAmount,
  vatExemptSales,
  zeroRatedSales,
  totalAmount
}) {
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
        <div className="waybill-meta-cell">
          <div className="waybill-cell-label">Buyer / Recipient</div>
          <div className="waybill-cell-val">{buyerName || 'Marketplace Buyer'}</div>
        </div>
        <div className="waybill-meta-cell">
          <div className="waybill-cell-label">Order Status / TIN</div>
          <div className="waybill-cell-val">
            {orderStatus || 'PAID'} {buyerTin && buyerTin !== '—' ? `· ${buyerTin}` : ''}
          </div>
        </div>
        {issuedAt && issuedAt !== '—' && (
          <div className="waybill-meta-cell full-row">
            <div className="waybill-cell-label">Date & Time Issued</div>
            <div className="waybill-cell-val">{issuedAt}</div>
          </div>
        )}
      </div>

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
                  ₱{ln.lineTotal ?? ln.line_total ?? ln.total ?? '0.00'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="waybill-tax-box">
        <div className="waybill-tax-row">
          <span>Discount / Voucher:</span>
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
    </div>
  );
}

