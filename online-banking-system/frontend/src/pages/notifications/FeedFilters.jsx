import { Input, Select, SecondaryButton } from '../../components/ui';
import LabeledField from '../_customer/LabeledField';

export const EMPTY_FILTERS = { category: '', isRead: '', from: '', to: '', q: '' };

export default function FeedFilters({ filters, onChange, rangeError }) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });
  const active = Object.values(filters).some(Boolean);
  return (
    <form role="search" aria-label="Filter notifications" onSubmit={(e) => e.preventDefault()} className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
      <LabeledField label="Category">
        <Select value={filters.category} onChange={set('category')}>
          <option value="">All</option>
          <option value="Transactional">Transactional</option>
          <option value="Promotional">Promotional</option>
          <option value="Security">Security</option>
        </Select>
      </LabeledField>
      <LabeledField label="Show">
        <Select value={filters.isRead} onChange={set('isRead')}>
          <option value="">All</option>
          <option value="false">Unread</option>
          <option value="true">Read</option>
        </Select>
      </LabeledField>
      <LabeledField label="Search" className="col-span-2 lg:col-span-1">
        <Input type="search" value={filters.q} onChange={set('q')} placeholder="Search messages" />
      </LabeledField>
      <LabeledField label="From">
        <Input type="date" value={filters.from} max={filters.to || undefined} onChange={set('from')} />
      </LabeledField>
      <LabeledField label="To" error={rangeError}>
        <Input type="date" value={filters.to} min={filters.from || undefined} onChange={set('to')} />
      </LabeledField>
      <div className="col-span-2 lg:col-span-1 flex items-end">
        <SecondaryButton type="button" disabled={!active} onClick={() => onChange(EMPTY_FILTERS)} className="w-full lg:w-auto">Clear filters</SecondaryButton>
      </div>
    </form>
  );
}
