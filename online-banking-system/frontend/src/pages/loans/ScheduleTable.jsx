import { formatCurrency, formatDate } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';

/**
 * Amortisation table. With `withDates` it shows due dates and Paid/Due status
 * (a real loan); without, it is the plain calculator schedule.
 */
export default function ScheduleTable({ rows, withDates = false, label, tall = true }) {
  const nextDue = withDates ? rows.find((r) => r.status === 'Due') : null;
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`relative overflow-auto border border-gray-200 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-navy ${tall ? 'max-h-96' : ''}`}
    >
      <table className="w-full text-sm min-w-[34rem]">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th scope="col" className="sticky top-0 z-10 bg-gray-50 px-3 py-2 font-medium">No.</th>
            {withDates && <th scope="col" className="sticky top-0 z-10 bg-gray-50 px-3 py-2 font-medium">Due date</th>}
            <th scope="col" className="sticky top-0 z-10 bg-gray-50 px-3 py-2 font-medium text-right">EMI</th>
            <th scope="col" className="sticky top-0 z-10 bg-gray-50 px-3 py-2 font-medium text-right">Principal</th>
            <th scope="col" className="sticky top-0 z-10 bg-gray-50 px-3 py-2 font-medium text-right">Interest</th>
            <th scope="col" className="sticky top-0 z-10 bg-gray-50 px-3 py-2 font-medium text-right">Balance after</th>
            {withDates && <th scope="col" className="sticky top-0 z-10 bg-gray-50 px-3 py-2 font-medium text-right">Status</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const paid = r.status === 'Paid';
            return (
              <tr key={r.installment} className={`border-t border-gray-100 ${r === nextDue ? 'bg-amber-50' : ''} ${paid ? 'text-gray-500' : 'text-gray-700'}`}>
                <td className="px-3 py-2">{r.installment}</td>
                {withDates && <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.dueDate)}</td>}
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(r.emi)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(r.principalComponent)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(r.interestComponent)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(r.balanceAfter)}</td>
                {withDates && <td className="px-3 py-2 text-right"><StatusBadge status={r.status} /></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
