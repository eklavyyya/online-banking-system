import StatusBadge from '../../components/StatusBadge';
import { formatExpiry, cardName } from './cardUtils';

/** Bank-card style tile. Cards that cannot be used are muted to a grey gradient. */
export default function CardTile({ card }) {
  const frozen = card.status !== 'Active';
  return (
    <div
      role="group"
      aria-label={`${cardName(card)}, ${card.network}, ${card.status}`}
      className={`relative w-full max-w-sm aspect-[1.586/1] rounded-2xl p-4 sm:p-5 text-white shadow-lg overflow-hidden flex flex-col justify-between ${
        frozen ? 'bg-gradient-to-br from-gray-800 via-gray-700 to-gray-600' : 'bg-gradient-to-br from-navy-dark via-navy to-navy-light'
      }`}
    >
      <span aria-hidden="true" className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/5" />
      <span aria-hidden="true" className={`absolute -right-2 top-14 h-40 w-40 rounded-full ${frozen ? 'bg-white/5' : 'bg-gold/10'}`} />

      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="font-serif font-bold tracking-widest text-gold-light text-sm">OBS BANK</p>
          <p className="text-[11px] uppercase tracking-widest text-ice mt-0.5">{card.cardType}</p>
        </div>
        <StatusBadge status={card.status} />
      </div>

      <div className="relative">
        <span aria-hidden="true" className="block h-7 w-10 rounded-md bg-gradient-to-br from-gold-light to-gold mb-2" />
        <p className="font-mono text-base sm:text-lg tracking-[0.12em] sm:tracking-[0.18em] whitespace-nowrap">{card.cardNumberMasked}</p>
        <p className="text-[11px] text-ice mt-1">Linked account {card.accountNumberMasked}</p>
      </div>

      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-ice">Card holder</p>
          <p className="text-sm font-medium truncate">{card.cardHolderName}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-ice">Valid thru</p>
          <p className="text-sm font-medium font-mono">{formatExpiry(card.expiryDate)}</p>
        </div>
        <p className="text-base font-bold italic tracking-wide shrink-0">{card.network}</p>
      </div>
    </div>
  );
}
