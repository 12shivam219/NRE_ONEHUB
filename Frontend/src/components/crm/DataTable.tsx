import { useState, useMemo, memo, useRef } from 'react';
import { Eye, Trash2, CheckSquare, Square } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';

export type SortField = string;
export type SortOrder = 'asc' | 'desc';

export interface Column<T> {
  key: keyof T | string;
  label: string;
  width: string;
  render?: (item: T, key: string) => React.ReactNode;
  sortable?: boolean;
}

 
export interface DataTableProps<T extends { id: string } = any> {
  data: T[];
  columns: Column<T>[];
  onViewDetails: (item: T) => void;
  onDelete: (id: string) => void;
  onActionClick?: (action: string, item: T) => void;
  onRowClick?: (item: T) => void; // Direct row click handler
  isAdmin: boolean;
  title: string;
  serverSortField?: string;
  serverSortOrder?: 'asc' | 'desc';
  onSortChange?: (field: string, order: 'asc' | 'desc') => void;
  page: number;
  hasNextPage: boolean;
  isFetchingPage: boolean;
  onPageChange: (page: number) => void;
  headerSearch?: JSX.Element | null;
  emptyStateIcon?: React.FC<{ className?: string }>;
  emptyStateMessage?: string;
  hideHeader?: boolean;
  hideFooter?: boolean;
}

const DataTableRow = memo(({
  item,
  isSelected,
  columns,
  toggleRowSelected,
  onViewDetails,
  onDelete,
  onRowClick,
  isAdmin,
  rowRef,
  rowIndex,
  dataIndex,
}: {
  item: { id: string };
  isSelected: boolean;
  columns: Column<{ id: string }>[];
  toggleRowSelected: (id: string) => void;
  onViewDetails: (item: { id: string }) => void;
  onDelete: (id: string) => void;
  onRowClick?: (item: { id: string }) => void;
  isAdmin: boolean;
  rowIndex: number;
  rowRef?: (el: HTMLTableRowElement | null) => void;
  dataIndex?: number;
}) => {
  const isAlternate = rowIndex % 2 === 1;
  
  return (
    <tr
      ref={rowRef}
      data-index={dataIndex}
      onClick={() => onRowClick?.(item)}
      className={`
        transition-colors duration-150
        border-b border-[#EAECEF]
        ${isAlternate ? 'bg-[#FAFBFC]' : 'bg-white'}
        ${onRowClick ? 'cursor-pointer' : ''}
        hover:bg-[#F5F7FA]
        h-14
      `}
    >
      {/* Checkbox */}
      <td className="px-4 py-0 text-center align-middle" style={{ width: '44px' }}>
        <div className="flex items-center justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleRowSelected(item.id);
            }}
            className="p-1.5 hover:bg-gray-200 hover:bg-opacity-50 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
            aria-pressed={isSelected}
            title={isSelected ? 'Deselect item' : 'Select item'}
            aria-label={isSelected ? 'Deselect' : 'Select'}
          >
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : (
              <Square className="w-4 h-4 text-[#9CA3AF] hover:text-gray-600" />
            )}
          </button>
        </div>
      </td>

      {/* Data columns */}
      {columns.map((col) => (
        <td
          key={String(col.key)}
          className="px-4 py-0 text-left align-middle truncate font-normal text-[#475569]"
          style={{ width: col.width, fontSize: '0.8125rem' }}
          title={String(item[col.key as keyof typeof item] || '')}
        >
          <div className="truncate">
            {col.render ? col.render(item, String(col.key)) : String(item[col.key as keyof typeof item] || '—')}
          </div>
        </td>
      ))}

      {/* Actions */}
      <td className="px-4 py-0 text-right align-middle" style={{ width: '90px' }}>
        <div className="flex gap-1.5 justify-end items-center">
          <Tooltip title="View details">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(item);
              }}
              className="p-2 text-[#64748B] hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-30"
              aria-label="View details"
            >
              <Eye className="w-4 h-4" />
            </button>
          </Tooltip>
          
          {isAdmin && (
            <Tooltip title="Delete item">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="p-2 text-[#64748B] hover:text-red-600 hover:bg-red-50 rounded-md transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-30"
                aria-label="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </Tooltip>
          )}
        </div>
      </td>
    </tr>
  );
});

export const DataTable = memo(({
  data,
  columns,
  onViewDetails,
  onDelete,
  onRowClick,
  isAdmin,
  title,
  page,
  hasNextPage,
  isFetchingPage,
  onPageChange,
  headerSearch,
  emptyStateIcon: EmptyStateIcon,
  emptyStateMessage,
  hideHeader,
  hideFooter,
  // serverSortField and serverSortOrder are available for future sorting implementation
  onSortChange,
}: DataTableProps) => {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const parentRef = useRef<HTMLDivElement | null>(null);

  const sortedData = useMemo(() => {
    if (onSortChange) return data;
    return data;
  }, [data, onSortChange]);

  const toggleRowSelected = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === sortedData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(sortedData.map(item => item.id)));
    }
  };

  const rowVirtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
    measureElement: typeof window !== 'undefined' && navigator.userAgent.indexOf('jsdom') === -1 ? element => element?.getBoundingClientRect().height : undefined,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  const totalWidth = columns.reduce((sum, col) => {
    const width = parseFloat(col.width);
    return sum + width;
  }, 40 + 140); // checkbox + actions

  return (
    <div className="w-full bg-white rounded-lg border border-[#E5E7EB]">
      {/* Toolbar - Header with Title and Search */}
      {!hideHeader && (
        <div className="px-6 py-4 border-b border-[#EAECEF] bg-white">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-[16px] font-semibold text-[#0F172A]">{title}</h3>
              <p className="text-[12px] text-[#64748B] mt-1">{sortedData.length} items total</p>
            </div>
            
            {/* Search Bar */}
            <div className="w-full sm:w-auto">
              {headerSearch ?? null}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <Box
        ref={parentRef}
        sx={{
          overflow: 'auto',
          overflowX: { xs: 'auto', sm: 'auto', md: 'auto' },
          overflowY: 'auto',
          maxHeight: { xs: '60vh', sm: '65vh', md: '70vh' },
          pb: 0,
          scrollbarGutter: 'stable',
          width: '100%',
          willChange: 'transform',
          contain: 'content',
          '& table': {
            width: '100%',
            minWidth: { xs: `${Math.max(totalWidth, 1200)}px`, sm: `${Math.max(totalWidth, 1200)}px`, md: '100%' },
            tableLayout: 'auto',
            borderCollapse: 'collapse',
          },
          '& thead': {
            position: 'sticky',
            top: 0,
            zIndex: 10,
          },
        }}
      >
        <table className="w-full">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#EAECEF]">
              {/* Checkbox Header */}
              <th className="px-4 py-3 text-center align-middle" style={{ width: '44px', fontSize: '0.75rem', fontWeight: 600 }}>
                <button
                  onClick={toggleSelectAll}
                  className="p-1.5 hover:bg-gray-200 hover:bg-opacity-50 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                  title={selectedRows.size === sortedData.length ? 'Deselect all' : 'Select all'}
                  aria-label={selectedRows.size === sortedData.length ? 'Deselect all' : 'Select all'}
                >
                  {selectedRows.size === sortedData.length && sortedData.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-[#9CA3AF] hover:text-gray-600" />
                  )}
                </button>
              </th>
              
              {/* Column Headers */}
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className="px-4 py-3 text-left align-middle"
                  style={{ width: col.width, fontSize: '0.75rem', fontWeight: 600 }}
                >
                  <span className="text-[#475569] uppercase tracking-wide">
                    {col.label}
                  </span>
                </th>
              ))}
              
              {/* Actions Header */}
              <th className="px-4 py-3 text-right align-middle" style={{ width: '90px', fontSize: '0.75rem', fontWeight: 600 }}>
                <span className="text-[#475569] uppercase tracking-wide">Actions</span>
              </th>
            </tr>
          </thead>
          
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    {EmptyStateIcon && (
                      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                        <EmptyStateIcon className="w-7 h-7 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-[14px] font-semibold text-[#0F172A]">
                        {emptyStateMessage || 'No data found'}
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={columns.length + 2} style={{ height: paddingTop }} />
                  </tr>
                ) : null}

                {virtualItems.map((virtualRow) => {
                  const item = sortedData[virtualRow.index];
                  const isSelected = selectedRows.has(item.id);
                  return (
                    <DataTableRow
                      key={item.id}
                      item={item}
                      isSelected={isSelected}
                      columns={columns}
                      toggleRowSelected={toggleRowSelected}
                      onViewDetails={onViewDetails}
                      onDelete={onDelete}
                      onRowClick={onRowClick}
                      isAdmin={isAdmin}
                      rowIndex={virtualRow.index}
                      dataIndex={virtualRow.index}
                    />
                  );
                })}

                {paddingBottom > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={columns.length + 2} style={{ height: paddingBottom }} />
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </Box>

      {/* Footer - Pagination */}
      {!hideFooter && (
        <div className="px-6 py-4 border-t border-[#EAECEF] bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-[13px] text-[#64748B]">
            <span>
              Page: <span className="font-semibold text-[#0F172A]">{page + 1}</span>
            </span>
            <span className="w-px h-4 bg-[#E5E7EB]" />
            <span>
              Rows: <span className="font-semibold text-[#0F172A]">{sortedData.length}</span>
            </span>
            <span className="w-px h-4 bg-[#E5E7EB]" />
            <span>
              Selected: <span className="font-semibold text-[#0F172A]">{selectedRows.size}</span>
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0 || isFetchingPage}
              className="px-4 py-2 text-[13px] font-medium text-[#475569] bg-white border border-[#D1D5DB] rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-all"
            >
              ← Previous
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={!hasNextPage || isFetchingPage}
              className="px-4 py-2 text-[13px] font-medium text-[#475569] bg-white border border-[#D1D5DB] rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-all"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
