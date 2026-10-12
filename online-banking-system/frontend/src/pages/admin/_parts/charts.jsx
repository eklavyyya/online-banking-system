import { useState } from 'react';
import { Card } from '../../../components/ui';
import { useElementWidth } from './hooks';

// Plain SVG / CSS charts. Colours are the validated categorical slots
// (blue, orange, aqua, violet) and the fixed status colours; marks carry the
// colour, text always stays in grey ink.
export const COLOR = { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', violet: '#4a3aa7' };
export const STATUS_COLOR = { Success: '#0ca30c', Failed: '#d03b3b', Pending: '#fab219' };
const GRID = '#e5e7eb';
const AXIS = '#d1d5db';
const INK = '#6b7280';
const SURFACE = '#ffffff';

const inr0 = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
export const moneyTick = (n) => (n === 0 ? '₹0' : `₹${compact.format(n)}`);
export const countTick = (n) => compact.format(n);
export { inr0 };

export function parseDay(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const dayLabel = (key) => parseDay(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const dayLong = (key) => parseDay(key).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function niceScale(max, target = 3, integer = false) {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const rough = max / target;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.ceil(step));
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { max: niceMax, ticks };
}

function barPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// ------------------------------------------------------------------ card
/** Title, a text alternative for screen readers, and a table twin behind a toggle. */
export function ChartCard({ title, description, summary, table, controls, children, className = '' }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={`p-4 sm:p-5 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-navy">{title}</h3>
          {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
        </div>
        <button
          type="button"
          aria-expanded={asTable}
          onClick={() => setAsTable((v) => !v)}
          className="shrink-0 text-xs font-medium text-navy border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
        >
          {asTable ? 'View as chart' : 'View as table'}
        </button>
      </div>
      {controls && !asTable && <div className="mb-3">{controls}</div>}
      {asTable ? (
        <div className="relative overflow-auto max-h-72 border border-gray-100 rounded-lg" tabIndex={0} role="region" aria-label={`${title} as a table`}>
          <table className="w-full text-xs">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-gray-50 sticky top-0">
              <tr>{table.columns.map((c, i) => <th key={c} scope="col" className={`py-1.5 px-3 font-medium text-gray-500 ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {table.rows.map((r, ri) => (
                <tr key={ri}>{r.map((cell, i) => (i === 0
                  ? <th key={i} scope="row" className="py-1.5 px-3 text-left font-normal text-gray-700 whitespace-nowrap">{cell}</th>
                  : <td key={i} className="py-1.5 px-3 text-right text-gray-700 whitespace-nowrap">{cell}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={summary}>{children}</div>
      )}
    </Card>
  );
}

export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-gray-600">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.line
            ? <span className="inline-block w-4 h-0.5 rounded" style={{ background: i.color }} />
            : <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------- per-day bars and lines
/**
 * One x axis (days) shared by 1-2 stacked panels, never a second y axis.
 * panels = [{ kind: 'bar' | 'line', color, label, get(day), tick(n), format(n), integer? }]
 */
export function TimePanels({ days, panels, panelHeight = 104 }) {
  const [wrapRef, width] = useElementWidth(600);
  const [active, setActive] = useState(null);
  const n = days.length;
  const left = 48, right = 14, top = 16, gap = 30, bottom = 24;
  const plotW = Math.max(40, width - left - right);
  const slot = plotW / Math.max(n, 1);
  const H = top + panels.length * panelHeight + (panels.length - 1) * gap + bottom;
  const cx = (i) => left + (i + 0.5) * slot;

  const maxTicks = Math.max(2, Math.floor(plotW / 72));
  const every = Math.max(1, Math.ceil(n / maxTicks));
  const xTicks = [];
  for (let i = 0; i < n; i += every) xTicks.push(i);

  function onMove(e) {
    const box = wrapRef.current.getBoundingClientRect();
    const i = Math.floor((e.clientX - box.left - left) / slot);
    setActive(Math.min(n - 1, Math.max(0, i)));
  }

  const flip = active !== null && cx(active) > width / 2;
  return (
    <div ref={wrapRef} className="relative">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block" aria-hidden="true">
        {panels.map((p, k) => {
          const y0 = top + k * (panelHeight + gap);
          const values = days.map((d) => p.get(d));
          const scale = niceScale(Math.max(...values, 0), 3, p.integer);
          const y = (v) => y0 + panelHeight - (v / scale.max) * panelHeight;
          const peak = values.indexOf(Math.max(...values));
          const peakIsUnique = values.filter((v) => v === values[peak]).length === 1;
          const bw = Math.min(24, Math.max(1, slot - 2));
          const pts = values.map((v, i) => `${cx(i)},${y(v)}`);
          return (
            <g key={p.label}>
              {panels.length > 1 && <text x={left} y={y0 - 7} fontSize="11" fill={INK}>{p.label}</text>}
              {scale.ticks.map((t) => (
                <g key={t}>
                  <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth="1" />
                  <text x={left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="11" fill={INK}>{p.tick(t)}</text>
                </g>
              ))}
              {p.kind === 'bar' && values.map((v, i) => (v > 0 ? (
                <path key={i} d={barPath(cx(i) - bw / 2, y(v), bw, y0 + panelHeight - y(v), 4)} fill={p.color} opacity={active === null || active === i ? 1 : 0.55} />
              ) : null))}
              {p.kind === 'line' && (
                <>
                  <path d={`M${cx(0)},${y0 + panelHeight}L${pts.join('L')}L${cx(n - 1)},${y0 + panelHeight}Z`} fill={p.color} opacity="0.1" />
                  <polyline points={pts.join(' ')} fill="none" stroke={p.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={cx(n - 1)} cy={y(values[n - 1])} r="4" fill={p.color} stroke={SURFACE} strokeWidth="2" />
                  {active !== null && <circle cx={cx(active)} cy={y(values[active])} r="4" fill={p.color} stroke={SURFACE} strokeWidth="2" />}
                </>
              )}
              {values[peak] > 0 && peakIsUnique && (
                <text
                  x={Math.min(left + plotW - 4, Math.max(left + 4, cx(peak)))}
                  y={y(values[peak]) - 5}
                  textAnchor={cx(peak) > left + plotW - 60 ? 'end' : cx(peak) < left + 60 ? 'start' : 'middle'}
                  fontSize="11"
                  fontWeight="600"
                  fill="#374151"
                >
                  {p.format(values[peak])}
                </text>
              )}
            </g>
          );
        })}
        {xTicks.map((i) => (
          <text key={i} x={cx(i)} y={H - 6} textAnchor="middle" fontSize="11" fill={INK}>{dayLabel(days[i].date)}</text>
        ))}
        {active !== null && (
          <line x1={cx(active)} x2={cx(active)} y1={top - 4} y2={H - bottom} stroke="#9ca3af" strokeWidth="1" />
        )}
        <rect x={left} y="0" width={plotW} height={H - bottom} fill="transparent" style={{ touchAction: 'pan-y' }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setActive(null)} />
      </svg>
      {active !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-gray-200 bg-white shadow-md px-3 py-2 text-xs"
          style={{ top: 0, left: cx(active), transform: `translateX(${flip ? 'calc(-100% - 10px)' : '10px'})` }}
        >
          <p className="text-gray-500 mb-1 whitespace-nowrap">{dayLong(days[active].date)}</p>
          {panels.map((p) => (
            <p key={p.label} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: p.color }} />
              <span className="font-semibold text-gray-900">{p.format(p.get(days[active]))}</span>
              <span className="text-gray-500">{p.label}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------- horizontal bars
/** rows = [{ key, label, sub?, value, display }]. Values are always printed, so nothing depends on hover. */
export function HBarChart({ rows, color }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[6.5rem_1fr_4.75rem] sm:grid-cols-[9rem_1fr_5.5rem] items-center gap-x-3 py-1.5">
          <div className="min-w-0">
            <p className="text-sm text-gray-700 truncate" title={r.label}>{r.label}</p>
            {r.sub && <p className="text-xs text-gray-400 truncate">{r.sub}</p>}
          </div>
          <div className="border-l border-gray-300 h-5 flex items-center" title={`${r.label}: ${r.display}`}>
            <div
              className="h-3 hover:opacity-80 transition-opacity"
              style={{ width: max > 0 ? `${Math.max(r.value > 0 ? 1 : 0, (r.value / max) * 100)}%` : 0, background: color, borderRadius: '0 4px 4px 0' }}
            />
          </div>
          <p className="text-xs font-semibold text-gray-800 text-right tabular-nums">{r.display}</p>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ donut
export function Donut({ slices, centerValue, centerLabel }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 52, SW = 18, SIZE = 140, C = 2 * Math.PI * R;
  const visible = slices.filter((s) => s.value > 0);
  let offset = 0;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-4">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={GRID} strokeWidth={SW} />
          {visible.map((s) => {
            const len = (s.value / total) * C;
            const gapLen = visible.length > 1 ? 2 : 0;
            const el = (
              <circle
                key={s.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={SW}
                strokeDasharray={`${Math.max(len - gapLen, 0.5)} ${C}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-bold text-gray-900">{centerValue}</span>
          <span className="text-[11px] text-gray-500">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full sm:w-auto space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-gray-700 w-16">{s.label}</span>
            <span className="font-semibold text-gray-900 tabular-nums">{s.value}</span>
            <span className="text-xs text-gray-400 tabular-nums">{total ? `${((s.value / total) * 100).toFixed(1)}%` : '0%'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
