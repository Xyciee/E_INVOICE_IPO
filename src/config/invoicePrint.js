/**
 * Texts printed on the Letter-size sales invoice for Odoo (wholesale) invoices. Change them here; nothing else
 * needs to change. The exact wording (BIR / CAS footer, titles) still waits on the accountant.
 */

export const SELLER = {
  name: 'IPOLYMER SOLUTIONS CORPORATION',
  tinLine: 'VAT Reg. TIN: 010-015-302-00000',
  addressLines: [
    '346 General Luis St., Bagbaguin, Barangay 165, District 1,',
    '1400 City of Caloocan, NCR, Third District, Philippines'
  ]
};

export const ODOO_INVOICE_TEXT = {
  // [small word, big underlined word] at the top right
  invoiceTitle: ['SALES', 'INVOICE'],
  refundTitle: ['CREDIT', 'NOTE'],
  nothingFollows: '***NOTHING FOLLOWS***',
  // the item table always shows at least this many rows, like the printed booklet
  minItemRows: 14,
  // printed across the sheet when the invoice is not posted in Odoo any more
  notPostedStamp: {
    cancel: 'CANCELLED IN ODOO — NOT VALID',
    draft: 'DRAFT IN ODOO — NOT VALID'
  },
  // small lines at the bottom left (BIR permit / CAS acknowledgement wording from the accountant)
  footerLines: [],
  // next to the QR code (buyer portal) printed on e-invoices
  portalLine: 'Scan to view this invoice online.'
};

/**
 * Texts printed on the 100x150 mm slip (marketplace and Odoo e-invoices, WaybillTicket). User decisions 2026-11-25:
 * the buyer block prints blank for the generic marketplace buyer ("Shopee Buyer"); the platform voucher and the
 * amount paid by the buyer are an information line below the total, outside the VAT figures.
 */
export const SLIP_TEXT = {
  // Seller-funded discounts only (seller vouchers, bundle deals, Shopee bundle rounding). Item lines show quantity x
  // price before discount; this line is taken off once, so items - discount = total.
  discount: 'Less: Discount',
  soldTo: 'Sold To',
  address: 'Address',
  tinBranch: 'TIN - Branch',
  // {platform} = Shopee / Lazada / TikTok. Printed only when the platform voucher amount is known.
  platformVoucher: 'Platform voucher (paid by {platform})',
  buyerPaid: 'Amount paid by buyer',
  // next to the QR code (buyer portal). Official BIR wording is added after the PTI.
  portalTitle: 'Scan to view this invoice online',
  portalHint: 'Opens your invoice on our website. Keep this slip.'
};

const PLATFORM_NAMES = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok' };
export const platformName = (platform) =>
  PLATFORM_NAMES[String(platform || '').toLowerCase()] || String(platform || '').trim() || 'the platform';
