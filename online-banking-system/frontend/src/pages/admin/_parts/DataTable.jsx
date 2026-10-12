import { useMediaQuery } from './hooks';

/**
 * One column definition drives two layouts: a real <table> from tablet width
 * up, and a stack of cards on phones.
 *   columns = [{ key, header, cell(row), className?, card?: 'title'|'badge'|'actions'|'hide', srOnlyHeader? }]
 * `onRowClick` is a mouse convenience only; give keyboard users a real button inside a cell.
 */
export default function DataTable({ columns, rows, rowKey, caption, onRowClick, rowClass, dim = false }) {
  const narrow = useMediaQuery('(max-width: 767px)');
  const dimClass = dim ? 'opacity-60' : '';

  if (narrow) {
    const title = columns.find((c) => c.card === 'title');
    const badge = columns.find((c) => c.card === 'badge');
    const actions = columns.find((c) => c.card === 'actions');
    const fields = columns.filter((c) => !c.card);
    return (
      <ul aria-label={caption} className={`space-y-3 transition-opacity ${dimClass}`}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`rounded-lg border border-gray-200 p-3 ${onRowClick ? 'cursor-pointer' : ''} ${rowClass ? rowClass(row) : 'bg-white'}`}
          >
            {(title || badge) && (
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 font-medium text-gray-800">{title && title.cell(row)}</div>
                <div className="shrink-0">{badge && badge.cell(row)}</div>
              </div>
            )}
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              {fields.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-xs text-gray-400 pt-0.5">{c.header}</dt>
                  <dd className="min-w-0 break-words text-gray-700">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
            {actions && <div className="flex flex-wrap gap-2 mt-3">{actions.cell(row)}</div>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={`relative overflow-x-auto transition-opacity ${dimClass}`}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-200">
            {columns.map((c) => (
              <th key={c.key} scope="col" className="py-2 px-3 font-medium whitespace-nowrap">
                {c.srOnlyHeader ? <span className="sr-only">{c.header}</span> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''} ${rowClass ? rowClass(row) : ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`py-3 px-3 align-top text-gray-700 ${c.className || ''}`}>{c.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
