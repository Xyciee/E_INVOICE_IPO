import React, { useMemo, useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import './pagination.css';

/**
 * Reusable hook to handle client-side pagination for any array of items.
 *
 * @param {Array} items - Source array of items
 * @param {number} defaultPageSize - Default page size (default: 10)
 * @returns {object} pagination state and sliced items
 */
export function usePagination(items, defaultPageSize = 10) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const safeItems = Array.isArray(items) ? items : [];
  const totalItems = safeItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset page when out of bounds (e.g. after searching or filtering)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return safeItems.slice(startIndex, startIndex + pageSize);
  }, [safeItems, currentPage, pageSize]);

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalItems,
    totalPages,
    paginatedItems
  };
}

/**
 * Reusable Table Pagination Component
 *
 * @param {number} currentPage - Active page (1-based index)
 * @param {number} totalItems - Total count of items
 * @param {number} pageSize - Number of items per page
 * @param {function} onPageChange - Callback when page changes (newPage) => void
 * @param {function} [onPageSizeChange] - Optional callback when page size changes (newSize) => void
 * @param {Array<number>} [pageSizeOptions] - Optional list of selectable page sizes
 */
export default function Pagination({
  currentPage = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50]
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, safeCurrentPage * pageSize);

  // Generate page numbers with smart ellipsis
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (safeCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }

    if (safeCurrentPage >= totalPages - 3) {
      return [
        1,
        '...',
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages
      ];
    }

    return [
      1,
      '...',
      safeCurrentPage - 1,
      safeCurrentPage,
      safeCurrentPage + 1,
      '...',
      totalPages
    ];
  }, [safeCurrentPage, totalPages]);

  const handlePageClick = (page) => {
    if (page === '...' || page === safeCurrentPage) return;
    if (page >= 1 && page <= totalPages && onPageChange) {
      onPageChange(page);
    }
  };

  const handleSizeChange = (e) => {
    const newSize = Number(e.target.value);
    if (onPageSizeChange) {
      onPageSizeChange(newSize);
    }
    if (onPageChange) {
      onPageChange(1);
    }
  };

  if (totalItems === 0) {
    return (
      <div className="table-pagination">
        <div className="pagination-info">
          <span>No records to display</span>
        </div>
      </div>
    );
  }

  return (
    <div className="table-pagination">
      <div className="pagination-info">
        <span>
          Showing <strong>{startItem}</strong> - <strong>{endItem}</strong> of{' '}
          <strong>{totalItems}</strong> entries
        </span>

        {onPageSizeChange && (
          <div className="pagination-size-wrap">
            <span>Show:</span>
            <select
              className="pagination-select"
              value={pageSize}
              onChange={handleSizeChange}
              aria-label="Items per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <span>per page</span>
          </div>
        )}
      </div>

      <div className="pagination-controls" aria-label="Pagination Navigation">
        {/* First Page */}
        <button
          className="pagination-btn"
          onClick={() => handlePageClick(1)}
          disabled={safeCurrentPage <= 1}
          title="First Page"
          aria-label="First Page"
        >
          <ChevronsLeft size={15} />
        </button>

        {/* Previous Page */}
        <button
          className="pagination-btn"
          onClick={() => handlePageClick(safeCurrentPage - 1)}
          disabled={safeCurrentPage <= 1}
          title="Previous Page"
          aria-label="Previous Page"
        >
          <ChevronLeft size={15} />
        </button>

        {/* Page Numbers */}
        {pageNumbers.map((page, idx) => {
          if (page === '...') {
            return (
              <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                …
              </span>
            );
          }
          const isActive = page === safeCurrentPage;
          return (
            <button
              key={page}
              className={`pagination-btn ${isActive ? 'active' : ''}`}
              onClick={() => handlePageClick(page)}
              aria-current={isActive ? 'page' : undefined}
            >
              {page}
            </button>
          );
        })}

        {/* Next Page */}
        <button
          className="pagination-btn"
          onClick={() => handlePageClick(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= totalPages}
          title="Next Page"
          aria-label="Next Page"
        >
          <ChevronRight size={15} />
        </button>

        {/* Last Page */}
        <button
          className="pagination-btn"
          onClick={() => handlePageClick(totalPages)}
          disabled={safeCurrentPage >= totalPages}
          title="Last Page"
          aria-label="Last Page"
        >
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  );
}

