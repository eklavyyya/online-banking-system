import { useState } from 'react';
import { adminApi, saveBlob } from '../../api';
import useLoad from '../../hooks/useLoad';
import { daysAgoInput, toInputDate } from '../../utils/format';
import { PageHeader, ErrorBanner, Spinner, Input, PrimaryButton, SecondaryButton } from '../../components/ui';
import Chips from './_parts/Chips';
import FormField from './_parts/FormField';
import { KpiTiles, ReportCharts } from './_parts/ReportSections';

const PRESETS = [{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }];

function presetRange(days) { return { from: daysAgoInput(days - 1), to: toInputDate() }; }

function downloadCsv(report) {
  const bene = Object.fromEntries(report.beneficiaries.byDay.map((d) => [d.date, d.count]));
  const rows = [
    ['Date', 'Transactions', 'Successful value (INR)', 'New beneficiaries'],
    ...report.transactions.byDay.map((d) => [d.date, d.count, Number(d.amount).toFixed(2), bene[d.date] || 0]),
  ];
  const csv = `${rows.map((r) => r.join(',')).join('\r\n')}\r\n`;
  saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `obs-daily-report_${report.range.from}_to_${report.range.to}.csv`);
}

export default function AdminReportsPage() {
  const [range, setRange] = useState(() => presetRange(30));
  const [draft, setDraft] = useState(() => presetRange(30));
  const [formError, setFormError] = useState('');

  const { data, error, loading } = useLoad(() => adminApi.summaryReport(range), [range.from, range.to]);

  const activePreset = PRESETS.find((p) => { const r = presetRange(Number(p.value)); return r.from === range.from && r.to === range.to; });

  function pick(value) {
    const r = presetRange(Number(value));
    setRange(r); setDraft(r); setFormError('');
  }
  function applyCustom(e) {
    e.preventDefault();
    if (!draft.from || !draft.to) { setFormError('Choose both a start and an end date.'); return; }
    setFormError('');
    setRange({ from: draft.from, to: draft.to });
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Activity summary for a date range (up to one year)"
        action={data && !error && (
          <SecondaryButton onClick={() => downloadCsv(data)} className="shrink-0 ml-3">Download CSV</SecondaryButton>
        )}
      />

      {/* One filter row above everything it scopes. */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Period</p>
            <Chips label="Date range presets" options={PRESETS} value={activePreset ? activePreset.value : ''} onChange={pick} />
          </div>
          <form onSubmit={applyCustom} noValidate className="flex flex-wrap items-end gap-3">
            <FormField label="From"><Input type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} /></FormField>
            <FormField label="To"><Input type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} /></FormField>
            <PrimaryButton type="submit" disabled={loading}>Apply range</PrimaryButton>
          </form>
        </div>
        {formError && <p role="alert" className="text-sm text-red-600 mt-3">{formError}</p>}
        {data && !error && <p className="text-xs text-gray-400 mt-3">Showing {data.range.from} to {data.range.to} ({data.range.days} day{data.range.days === 1 ? '' : 's'}).</p>}
      </div>

      <ErrorBanner message={error} />
      {loading && !data && <Spinner />}
      {data && !error && (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <KpiTiles report={data} />
          <ReportCharts report={data} />
        </div>
      )}
    </div>
  );
}
