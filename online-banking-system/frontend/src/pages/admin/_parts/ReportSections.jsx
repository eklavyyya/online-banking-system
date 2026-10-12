import { useState } from 'react';
import { formatCurrency, formatNumber, formatPercent } from '../../../utils/format';
import { ChartCard, Legend, TimePanels, HBarChart, Donut, COLOR, STATUS_COLOR, inr0, moneyTick, countTick, dayLabel } from './charts';
import { TYPE_LABEL } from './TransactionsTab';

const SR_LABEL = { ChequeBook: 'Cheque book', Statement: 'Statement', CardIssue: 'Card request', Complaint: 'Complaint', Other: 'Other' };
const plural = (n, word) => `${formatNumber(n)} ${word}${n === 1 ? '' : 's'}`;

export function Kpi({ label, value, hint }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 min-w-0">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold font-serif text-navy mt-1 break-words">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Group({ title, children }) {
  return (
    <section className="mb-6" aria-label={title}>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
    </section>
  );
}

export function KpiTiles({ report }) {
  const t = report.transactions;
  const sr = report.serviceRequests;
  const ln = report.loans;
  const rate = t.total ? formatPercent((t.byStatus.Success / t.total) * 100, 1) : '—';
  return (
    <>
      <Group title="Transactions">
        <Kpi label="Total transactions" value={formatNumber(t.total)} />
        <Kpi label="Value of successful" value={formatCurrency(t.successValue)} />
        <Kpi label="Success rate" value={rate} hint={t.total ? `${t.byStatus.Failed || 0} failed` : 'No transactions'} />
        <Kpi label="New beneficiaries" value={formatNumber(report.beneficiaries.added)} />
      </Group>
      <Group title="Service requests">
        <Kpi label="Raised" value={formatNumber(sr.raised)} hint={`${formatNumber(sr.openNow)} open right now`} />
        <Kpi label="Resolved" value={formatNumber(sr.resolved)} />
        <Kpi label="Average turnaround" value={sr.averageTatHours === null ? '—' : `${formatNumber(sr.averageTatHours)} h`} hint={sr.resolved ? 'Raised to resolved' : 'Nothing resolved yet'} />
      </Group>
      <Group title="Loans">
        <Kpi label="Applied" value={formatNumber(ln.applied)} />
        <Kpi label="Approved" value={formatNumber(ln.approved)} />
        <Kpi label="Rejected" value={formatNumber(ln.rejected)} />
        <Kpi label="Total disbursed" value={formatCurrency(ln.totalDisbursed)} />
      </Group>
    </>
  );
}

export function ReportCharts({ report }) {
  const t = report.transactions;
  const days = t.byDay;
  const bene = report.beneficiaries.byDay;
  const sr = report.serviceRequests;
  const [metric, setMetric] = useState('count');

  const peakCount = days.reduce((b, d) => (d.count > b.count ? d : b), days[0] || { count: 0 });
  const noTxns = t.total === 0;
  const empty = (text) => <p className="text-gray-400 text-sm text-center py-10">{text}</p>;

  const dailySummary = noTxns
    ? 'No transactions in this period.'
    : `Daily transactions over ${days.length} days: ${plural(t.total, 'transaction')}, busiest day ${dayLabel(peakCount.date)} with ${peakCount.count}. Successful value totals ${inr0(t.successValue)}.`;

  const typeRows = t.byType.map((x) => ({
    key: x.type,
    label: TYPE_LABEL[x.type] || x.type,
    sub: metric === 'count' ? inr0(x.amount) : plural(x.count, 'transaction'),
    value: metric === 'count' ? x.count : x.amount,
    display: metric === 'count' ? formatNumber(x.count) : inr0(x.amount),
  })).sort((a, b) => b.value - a.value);

  const statusSlices = ['Success', 'Failed', 'Pending'].map((s) => ({ label: s, value: t.byStatus[s] || 0, color: STATUS_COLOR[s] }));
  const raisedRows = [...sr.raisedByType].sort((a, b) => b.count - a.count).map((x) => ({ key: x.type, label: SR_LABEL[x.type] || x.type, value: x.count, display: formatNumber(x.count) }));
  const tatRows = [...sr.tatByType].sort((a, b) => b.averageHours - a.averageHours).map((x) => ({
    key: x.type, label: SR_LABEL[x.type] || x.type, sub: `${plural(x.resolved, 'request')} resolved`, value: x.averageHours, display: `${formatNumber(x.averageHours)} h`,
  }));

  return (
    <div className="space-y-4">
      <ChartCard
        title="Daily transactions"
        description="Number of transactions per day, and the value of the successful ones."
        summary={dailySummary}
        table={{
          columns: ['Date', 'Transactions', 'Successful value'],
          rows: days.map((d) => [dayLabel(d.date), formatNumber(d.count), formatCurrency(d.amount)]),
        }}
      >
        {noTxns ? empty('No transactions in this period.') : (
          <>
            <Legend items={[{ label: 'Transactions', color: COLOR.blue }, { label: 'Successful value', color: COLOR.orange, line: true }]} />
            <TimePanels
              days={days}
              panels={[
                { kind: 'bar', color: COLOR.blue, label: 'Transactions', get: (d) => d.count, tick: countTick, format: (v) => formatNumber(v), integer: true },
                { kind: 'line', color: COLOR.orange, label: 'Successful value', get: (d) => d.amount, tick: moneyTick, format: (v) => inr0(v) },
              ]}
            />
          </>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="By transaction type"
          description="Count and successful value for each type."
          summary={noTxns ? 'No transactions in this period.' : `Transactions by type: ${t.byType.map((x) => `${TYPE_LABEL[x.type] || x.type} ${x.count} (${inr0(x.amount)})`).join(', ')}.`}
          table={{ columns: ['Type', 'Transactions', 'Successful value'], rows: t.byType.map((x) => [TYPE_LABEL[x.type] || x.type, formatNumber(x.count), formatCurrency(x.amount)]) }}
          controls={(
            <div role="group" aria-label="Bar length shows" className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
              {[['count', 'Count'], ['amount', 'Amount']].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={metric === v} onClick={() => setMetric(v)} className={`px-3 py-1 font-medium ${metric === v ? 'bg-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>
          )}
        >
          {noTxns ? empty('No transactions in this period.') : <HBarChart rows={typeRows} color={metric === 'count' ? COLOR.blue : COLOR.orange} />}
        </ChartCard>

        <ChartCard
          title="Status split"
          description="How the transactions in this period ended."
          summary={noTxns ? 'No transactions in this period.' : `Status split of ${plural(t.total, 'transaction')}: ${statusSlices.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}.`}
          table={{ columns: ['Status', 'Transactions', 'Share'], rows: statusSlices.map((s) => [s.label, formatNumber(s.value), t.total ? formatPercent((s.value / t.total) * 100, 1) : '0%']) }}
        >
          {noTxns ? empty('No transactions in this period.') : (
            <Donut slices={statusSlices} centerValue={formatPercent((statusSlices[0].value / t.total) * 100, 1)} centerLabel="successful" />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="New beneficiaries per day"
        description="Payees added by customers."
        summary={report.beneficiaries.added === 0 ? 'No beneficiaries were added in this period.' : `${plural(report.beneficiaries.added, 'beneficiary')} added over ${bene.length} days.`}
        table={{ columns: ['Date', 'New beneficiaries'], rows: bene.map((d) => [dayLabel(d.date), formatNumber(d.count)]) }}
      >
        {report.beneficiaries.added === 0 ? empty('No beneficiaries were added in this period.') : (
          <TimePanels days={bene} panelHeight={90} panels={[{ kind: 'bar', color: COLOR.aqua, label: 'New beneficiaries', get: (d) => d.count, tick: countTick, format: (v) => formatNumber(v), integer: true }]} />
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Service requests raised"
          description="By request type."
          summary={raisedRows.length === 0 ? 'No service requests were raised in this period.' : `Service requests raised: ${raisedRows.map((r) => `${r.label} ${r.value}`).join(', ')}.`}
          table={{ columns: ['Type', 'Raised'], rows: raisedRows.map((r) => [r.label, r.display]) }}
        >
          {raisedRows.length === 0 ? empty('No service requests were raised in this period.') : <HBarChart rows={raisedRows} color={COLOR.blue} />}
        </ChartCard>
        <ChartCard
          title="Turnaround time"
          description="Average hours from raised to resolved, by type."
          summary={tatRows.length === 0 ? 'No service requests were resolved in this period.' : `Average turnaround in hours: ${tatRows.map((r) => `${r.label} ${r.value}`).join(', ')}.`}
          table={{ columns: ['Type', 'Resolved', 'Average hours'], rows: sr.tatByType.map((x) => [SR_LABEL[x.type] || x.type, formatNumber(x.resolved), formatNumber(x.averageHours)]) }}
        >
          {tatRows.length === 0 ? empty('No service requests were resolved in this period.') : <HBarChart rows={tatRows} color={COLOR.violet} />}
        </ChartCard>
      </div>
    </div>
  );
}
