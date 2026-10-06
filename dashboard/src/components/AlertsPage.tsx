import { unackedLabel } from '../lib/alerts';
import type { Sentinel } from '../types';
import { AlertItem } from './AlertItem';

export function AlertsPage({ s }: { s: Sentinel }) {
  const unacked = s.alerts.filter((a) => !a.acked).length;
  return (
    <section id="alertes" className="card" aria-label="Alertes">
      <div className="card-head" style={{ alignItems: 'center' }}>
        <h2>Historique des alertes</h2>
        <div className="topbar-tools">
          <span className="card-note">{unackedLabel(unacked)}</span>
          {unacked > 0 && <button type="button" className="btn btn-sm" onClick={s.ackAll}>Tout acquitter</button>}
        </div>
      </div>
      <div className="alert-list" aria-live="polite">
        {s.alerts.length === 0 && <p className="empty">Aucune alerte reçue.</p>}
        {s.alerts.map((a) => <AlertItem key={a.id} alert={a} onAck={s.ack} />)}
      </div>
    </section>
  );
}
