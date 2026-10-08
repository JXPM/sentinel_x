import { unackedLabel } from '../lib/alerts';
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
    </div>
  );
}
