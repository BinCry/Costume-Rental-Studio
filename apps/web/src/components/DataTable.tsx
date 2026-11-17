import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Field, Icon, SelectField } from './ui';

export interface TableColumn<T> {
  key: string;
  title: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  selectedId,
  onSelect,
  pageSize = 12,
  emptyText = 'Không có dữ liệu phù hợp',
  searchKey,
  searchLabel = 'Tìm trong bảng',
  searchPlaceholder = 'Nhập từ khóa',
  filterKey,
  filterLabel = 'Bộ lọc',
  filterDisplay = (value: string) => value,
}: {
  rows: T[];
  columns: TableColumn<T>[];
  selectedId?: string;
  onSelect?: (row: T) => void;
  pageSize?: number;
  emptyText?: string;
  searchKey: (row: T) => string;
  searchLabel?: string;
  searchPlaceholder?: string;
  filterKey?: (row: T) => string;
  filterLabel?: string;
  filterDisplay?: (value: string) => string;
}) {
  const [sort, setSort] = useState<{ key: string; direction: 1 | -1 }>();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const filterValues = filterKey ? [...new Set(rows.map(filterKey))] : [];
  const filtered = rows.filter(
    (row) =>
      (!filterKey || filter === 'all' || filterKey(row) === filter) &&
      searchKey(row)
        .toLocaleLowerCase('vi')
        .includes(search.toLocaleLowerCase('vi')),
  );
  const column = columns.find((entry) => entry.key === sort?.key);
  const sorted = column?.sortValue
    ? [...filtered].sort((a, b) => {
        const first = column.sortValue?.(a);
        const second = column.sortValue?.(b);
        return (
          (typeof first === 'number' && typeof second === 'number'
            ? first - second
            : String(first).localeCompare(String(second), 'vi')) * (sort?.direction ?? 1)
        );
      })
    : filtered;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const shown = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  if (rows.length === 0) return <p className="table-empty">{emptyText}</p>;
  return (
    <div className="data-table-wrap">
      <div className="table-toolbar">
        <Field
          label={searchLabel}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {filterKey && (
          <SelectField
            label={filterLabel}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Tất cả</option>
            {filterValues.map((value) => (
              <option key={value} value={value}>
                {filterDisplay(value)}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      {(search || filter !== 'all') && (
        <div className="table-filter-summary">
          <span>{sorted.length} / {rows.length} kết quả</span>
          <button type="button" className="text-button" onClick={() => {
            setSearch('');
            setFilter('all');
            setPage(1);
          }}>Xóa bộ lọc</button>
        </div>
      )}
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((entry) => (
                <th
                  key={entry.key}
                  scope="col"
                  aria-sort={
                    sort?.key === entry.key
                      ? sort.direction === 1
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {entry.sortValue ? (
                    <button
                      type="button"
                      aria-label={`${entry.title}, ${
                        sort?.key === entry.key
                          ? sort.direction === 1
                            ? 'đang sắp xếp tăng dần'
                            : 'đang sắp xếp giảm dần'
                          : 'chưa sắp xếp'
                      }`}
                      onClick={() => {
                        setSort((current) => ({
                          key: entry.key,
                          direction: current?.key === entry.key && current.direction === 1 ? -1 : 1,
                        }));
                        setPage(1);
                      }}
                    >
                      {entry.title} <span aria-hidden="true">↕</span>
                    </button>
                  ) : (
                    entry.title
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={row.id}
                className={selectedId === row.id ? 'selected' : ''}
                onClick={onSelect ? () => onSelect(row) : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onKeyDown={
                  onSelect
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelect(row);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((entry) => (
                  <td key={entry.key} data-label={entry.title}>
                    {entry.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="table-empty">{emptyText}</p>}
      </div>
      {pageCount > 1 && (
        <div className="table-pagination">
          <span>
            {sorted.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, sorted.length)} / ${sorted.length}` : '0 kết quả'} · Trang {currentPage} / {pageCount}
          </span>
          <div>
            <Button
              variant="quiet"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
              aria-label="Trang trước"
            >
              <Icon name="arrow" size={17} />
            </Button>
            <Button
              variant="quiet"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
              aria-label="Trang sau"
            >
              <Icon name="arrow" size={17} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
