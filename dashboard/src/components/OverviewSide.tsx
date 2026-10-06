import { unackedLabel } from '../lib/alerts';
import { ledViews } from '../lib/leds';
import type { Sentinel, TabId } from '../types';
import { AlertItem } from './AlertItem';

export function OverviewSide({ s, onTab }: { s: Sentinel; onTab: (t: TabId) => void }) {
  const unacked = s.alerts.filter((a) => !a.acked).length;
  return (
    <div className="col" style={{ flex: '1 1 340px' }}>
      <section className="card" aria-label="Dernières alertes" style={{ gap: 14 }}>
        <div className="card-head">
          <h2>Dernières alertes</h2>
          <span className="card-note">{unackedLabel(unacked)}</span>
        </div>
        {s.alerts.length === 0 && <p className="empty">Aucune alerte reçue.</p>}
        {s.alerts.slice(0, 3).map((a) => <AlertItem key={a.id} alert={a} compact />)}
        <button type="button" className="btn btn-sm btn-start" onClick={() => onTab('alertes')}>Voir toutes les alertes</button>
      </section>

      <section className="card" aria-label="Voyants du boîtier" style={{ gap: 14 }}>
        <h2>Voyants du boîtier</h2>
        {ledViews(s).map((l) => (
          <div key={l.id} className="led-row">
            <span className="led" style={l.lit ? { background: l.color, boxShadow: '0 0 10px ' + l.glow } : undefined} />
            <div className="led-text"><strong>{l.name}</strong><span>{l.hint}</span></div>
          </div>
        ))}
        <button type="button" className="btn btn-sm btn-start" onClick={() => onTab('commandes')}>Ouvrir les commandes</button>
      </section>
    </div>
  );
}
