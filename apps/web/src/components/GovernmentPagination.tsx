import React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "./GovernmentIcons.js";

export interface GovernmentPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function GovernmentPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: GovernmentPaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="gov-pagination" aria-label="Pagination">
      <div>
        Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of <strong>{totalItems}</strong> records
      </div>
      <div className="gov-pagination__pages">
        <button
          type="button"
          className="gov-pagination__btn"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous Page"
        >
          <ChevronLeftIcon size={12} /> Prev
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            className={`gov-pagination__btn ${pageNum === currentPage ? "gov-pagination__btn--active" : ""}`}
            onClick={() => onPageChange(pageNum)}
            aria-current={pageNum === currentPage ? "page" : undefined}
          >
            {pageNum}
          </button>
        ))}

        <button
          type="button"
          className="gov-pagination__btn"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next Page"
        >
          Next <ChevronRightIcon size={12} />
        </button>
      </div>
    </div>
  );
}
