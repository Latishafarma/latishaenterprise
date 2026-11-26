import React, { useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2
} from 'lucide-react';

export const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isLoading?: boolean;
  itemLabel?: string;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  itemLabel = 'data'
}) => {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);
  const startItem = totalCount === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalCount);

  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis-left' | 'ellipsis-right')[] = [];
    if (safeTotalPages <= 7) {
      for (let i = 1; i <= safeTotalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (safeCurrentPage > 3) pages.push('ellipsis-left');
    const start = Math.max(2, safeCurrentPage - 1);
    const end = Math.min(safeTotalPages - 1, safeCurrentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (safeCurrentPage < safeTotalPages - 2) pages.push('ellipsis-right');
    pages.push(safeTotalPages);
    return pages;
  }, [safeTotalPages, safeCurrentPage]);

  return (
    <div className="px-3.5 py-3 bg-slate-50/90 border-t border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-medium text-slate-600 tabular-nums inline-flex items-center gap-1.5">
          {isLoading && <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin shrink-0" />}
          <span>
            Menampilkan{' '}
            <strong className="text-slate-900">
              {startItem.toLocaleString('id-ID')}–{endItem.toLocaleString('id-ID')}
            </strong>{' '}
            dari <strong className="text-slate-900">{totalCount.toLocaleString('id-ID')}</strong>{' '}
            {itemLabel}
          </span>
        </span>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
            Baris / hal:
          </span>
          <div
            className="inline-flex items-center p-0.5 bg-white rounded-lg border border-slate-200 shadow-2xs"
            role="group"
            aria-label="Pilih jumlah baris per halaman"
          >
            {pageSizeOptions.map((size) => (
              <button
                key={size}
                type="button"
                disabled={isLoading}
                onClick={() => onPageSizeChange(size)}
                className={`px-2 py-1 rounded-md text-[11px] font-bold font-mono tabular-nums transition cursor-pointer disabled:opacity-60 ${
                  pageSize === size
                    ? 'bg-sky-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2">
        <span className="text-[11px] font-bold text-slate-500 tabular-nums">
          Hal. <strong className="text-slate-800">{safeCurrentPage}</strong> /{' '}
          <strong className="text-slate-800">{safeTotalPages}</strong>
        </span>

        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={isLoading || safeCurrentPage <= 1}
            title="Halaman pertama"
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
            disabled={isLoading || safeCurrentPage <= 1}
            title="Halaman sebelumnya"
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div className="hidden sm:inline-flex items-center gap-1">
            {pageNumbers.map((item) =>
              typeof item === 'number' ? (
                <button
                  key={item}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onPageChange(item)}
                  className={`min-w-[28px] h-7 px-2 rounded-lg text-[11px] font-bold font-mono tabular-nums border transition cursor-pointer disabled:opacity-70 ${
                    item === safeCurrentPage
                      ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {item}
                </button>
              ) : (
                <span
                  key={item}
                  className="px-1 text-xs font-bold text-slate-400 select-none"
                >
                  ...
                </span>
              )
            )}
          </div>

          <button
            type="button"
            onClick={() => onPageChange(Math.min(safeTotalPages, safeCurrentPage + 1))}
            disabled={isLoading || safeCurrentPage >= safeTotalPages}
            title="Halaman berikutnya"
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(safeTotalPages)}
            disabled={isLoading || safeCurrentPage >= safeTotalPages}
            title="Halaman terakhir"
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
