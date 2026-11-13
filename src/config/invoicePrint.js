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
  footerLines: []
};
