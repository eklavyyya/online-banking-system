import { Card } from '../../components/ui';
import CardTile from './CardTile';
import StatusSection from './StatusSection';
import LimitsSection from './LimitsSection';
import ChannelsSection from './ChannelsSection';
import { cardName } from './cardUtils';

export default function CardPanel({ card, onPatch }) {
  return (
    <Card className="p-4 sm:p-6">
      <h2 className="sr-only">{cardName(card)}</h2>
      <div className="grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] gap-6">
        <div><CardTile card={card} /></div>
        <div className="space-y-6">
          <StatusSection card={card} onPatch={onPatch} />
          <LimitsSection card={card} onPatch={onPatch} />
          <ChannelsSection card={card} onPatch={onPatch} />
        </div>
      </div>
    </Card>
  );
}
