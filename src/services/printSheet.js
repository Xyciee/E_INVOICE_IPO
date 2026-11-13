/**
 * Prints a document in its own page (a hidden iframe), so it gets its own paper size and is not affected by the
 * app's print styles (which are set up for the 100 x 150 mm thermal slip).
 */
import { renderToStaticMarkup } from 'react-dom/server';

const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {object} options
 * @param {import('react').ReactElement} options.element  what to print
 * @param {string} options.css     styles of the element
 * @param {string} options.title   page title (some browsers print it in the header)
 * @param {string} options.page    CSS @page size, e.g. "letter" or "8.5in 11in"
 * @param {string} options.margin  CSS @page margin
 */
export function printElement({ element, css, title, page = 'letter', margin = '0.4in' }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title || 'Invoice')}</title>
<style>
@page { size: ${page}; margin: ${margin}; }
html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${css}
</style></head><body>${renderToStaticMarkup(element)}</body></html>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();

  const cleanUp = () => setTimeout(() => frame.remove(), 1000);
  frame.contentWindow.addEventListener('afterprint', cleanUp, { once: true });
  // give the page a moment to lay out before the print dialog opens
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    cleanUp();
  }, 250);
}
