/** A row of mutually exclusive filter buttons. options = [{ value, label }] */
export default function FilterChips({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              on ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
