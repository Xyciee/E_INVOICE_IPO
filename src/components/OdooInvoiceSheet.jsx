import React from 'react';
import { SELLER, ODOO_INVOICE_TEXT } from '../config/invoicePrint';
import { money } from '../services/odooInvoicePrint';

/*
 * Letter-size (8.5 x 11 in) sales invoice for an Odoo (wholesale) invoice, laid out like the company's printed
 * booklet. Built from GET /api/odoo/invoices/<id> (move, lines, buyer, taxes). Amounts come from Odoo as they were
 * mirrored; VAT and withholding are read from the taxes on each line:
 *   - a tax with a positive rate is VAT, a negative rate is withholding (EWT);
 *   - VAT shown = Odoo's amount_tax + withholding, so the totals always add up to Odoo's amount_total.
 * The sheet is used both for the on-screen preview and for printing (rendered to HTML, printed in its own page).
 */

export default function OdooInvoiceSheet({ invoice }) {
  const text = ODOO_INVOICE_TEXT;
  const [smallTitle, bigTitle] = invoice.isRefund ? text.refundTitle : text.invoiceTitle;
  const blankRows = Math.max(0, text.minItemRows - invoice.items.length - 1);
  const stamp = invoice.state && invoice.state !== 'posted'
    ? (text.notPostedStamp[invoice.state] || text.notPostedStamp.draft) : null;
  const t = invoice.totals;
  const show = (value) => (value ? money(value) : '');

  return (
    <div className="oi-sheet">
      {stamp && <div className="oi-stamp">{stamp}</div>}

      <header className="oi-head">
        <div className="oi-seller">
          <div className="oi-seller-name">{SELLER.name}</div>
          <div>{SELLER.tinLine}</div>
          {SELLER.addressLines.map((l) => <div key={l}>{l}</div>)}
        </div>
        <div className="oi-title-box">
          <div className="oi-title"><span className="oi-title-small">{smallTitle}</span> <span className="oi-title-big">{bigTitle}</span></div>
          <div className="oi-number"><span className="oi-number-sign">№</span> {invoice.number}</div>
        </div>
      </header>

      <table className="oi-grid oi-party">
        <colgroup><col style={{ width: '62%' }} /><col style={{ width: '38%' }} /></colgroup>
        <tbody>
          <tr>
            <td className="oi-label-row"><span className="oi-label">SOLD TO:</span></td>
            <td><span className="oi-label">Date:</span> <span className="oi-value">{invoice.date}</span></td>
          </tr>
          <tr>
            <td rowSpan={2}><span className="oi-label">Registered Name:</span><div className="oi-value oi-buyer">{invoice.buyer.name}</div></td>
            <td><span className="oi-label">PO NO.</span> <span className="oi-value">{invoice.poNo}</span></td>
          </tr>
          <tr><td><span className="oi-label">REF NO.</span> <span className="oi-value">{invoice.refNo}</span></td></tr>
          <tr>
            <td><span className="oi-label">TIN</span><div className="oi-value">{invoice.buyer.tin}</div></td>
            <td><span className="oi-value">{invoice.terms}</span></td>
          </tr>
          <tr>
            <td colSpan={2}><span className="oi-label">Business Address:</span><div className="oi-value">{invoice.buyer.address}</div></td>
          </tr>
        </tbody>
      </table>

      <table className="oi-grid oi-items">
        <colgroup>
          <col style={{ width: '58%' }} /><col style={{ width: '11%' }} /><col style={{ width: '13%' }} /><col style={{ width: '18%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Item Description / Nature of Service</th>
            <th>Quantity</th>
            <th>Unit Cost/ Price</th>
            <th>Amount{invoice.currency ? ` (${invoice.currency})` : ''}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (item.text !== undefined ? (
            <tr key={item.key}>
              <td className={item.section ? 'oi-section' : 'oi-note'}>{item.text}</td><td /><td /><td />
            </tr>
          ) : (
            <tr key={item.key}>
              <td className="oi-desc">{item.description}</td>
              <td className="oi-num">{money(item.quantity)}</td>
              <td className="oi-num">{money(item.unitPrice)}</td>
              <td className="oi-num">{money(item.amount)}</td>
            </tr>
          )))}
          <tr><td className="oi-nothing">{text.nothingFollows}</td><td /><td /><td /></tr>
          {Array.from({ length: blankRows }, (_, i) => <tr key={`blank-${i}`} className="oi-blank"><td /><td /><td /><td /></tr>)}
        </tbody>
      </table>

      <div className="oi-bottom">
        <div className="oi-bottom-left">
          <table className="oi-grid oi-small">
            <colgroup><col style={{ width: '55%' }} /><col style={{ width: '45%' }} /></colgroup>
            <tbody>
              <tr><td>SC/PWD/ NAAC/ MOV/ Solo Parent ID No.:</td><td /></tr>
              <tr><td>SC/PWD/NAAC/ MOV Signature:</td><td /></tr>
            </tbody>
          </table>
          <table className="oi-grid oi-small oi-vat">
            <colgroup><col style={{ width: '55%' }} /><col style={{ width: '45%' }} /></colgroup>
            <tbody>
              <tr><td>VATable Sales</td><td className="oi-num">{show(t.vatable)}</td></tr>
              <tr><td>VAT</td><td className="oi-num">{show(t.vat)}</td></tr>
              <tr><td>Zero- Rated Sales</td><td className="oi-num">{show(t.zeroRated)}</td></tr>
              <tr><td>VAT-Exempt Sales</td><td className="oi-num">{show(t.exempt)}</td></tr>
            </tbody>
          </table>
          {ODOO_INVOICE_TEXT.footerLines.length > 0 && (
            <div className="oi-footer">{ODOO_INVOICE_TEXT.footerLines.map((l) => <div key={l}>{l}</div>)}</div>
          )}
        </div>

        <div className="oi-bottom-right">
          <table className="oi-grid oi-small oi-totals">
            <colgroup><col style={{ width: '58%' }} /><col style={{ width: '42%' }} /></colgroup>
            <tbody>
              <tr><td>Total Sales (VAT Inclusive)</td><td className="oi-num">{money(t.totalSales)}</td></tr>
              <tr><td>Less: VAT</td><td className="oi-num">{show(t.vat)}</td></tr>
              <tr><td>Amount Net of VAT</td><td className="oi-num">{money(t.netOfVat)}</td></tr>
              <tr><td>Less: Discount<br />(SC/PWD/ NAAC/ MOV/SP)</td><td className="oi-num" /></tr>
              <tr><td>Add: VAT</td><td className="oi-num">{show(t.vat)}</td></tr>
              <tr><td>Less: Withholding Tax</td><td className="oi-num">{show(t.withholding)}</td></tr>
              <tr className="oi-due"><td>TOTAL AMOUNT DUE</td><td className="oi-num">{money(t.amountDue)}</td></tr>
            </tbody>
          </table>
          <div className="oi-received">
            <span className="oi-checkbox" /> <strong>Received the amount of</strong>
            <div className="oi-sign-line" />
          </div>
        </div>
      </div>
    </div>
  );
}
