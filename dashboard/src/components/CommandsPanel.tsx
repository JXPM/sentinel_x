import type { Sentinel } from '../types';

export function CommandsPanel({ s }: { s: Sentinel }) {
  const { actuators: act } = s;
  const buzzHint = act.buzzing
    ? act.buzzAuto ? 'Déclenché automatiquement par l’intrusion' : 'Commande envoyée au boîtier'
    : 'Pulse de 2 s, commande MQTT';
  return (
    <section className="card narrow" aria-label="Commandes du boîtier" style={{ gap: 24 }}>
      <div className="col" style={{ gap: 4 }}>
        <h2>Actionneurs du boîtier</h2>
        <span className="card-note" style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>Chaque commande part en MQTT sur sentinel/sx-001/cmd.</span>
      </div>

      <div className="cmd">
        <div className="cmd-text"><strong>Buzzer <span className="pin">D7</span></strong><span>{buzzHint}</span></div>
        <button type="button" className="btn" onClick={s.buzz} disabled={act.buzzing}>
          {act.buzzing ? 'Le buzzer sonne…' : 'Faire sonner le buzzer (2 s)'}
        </button>
      </div>

      <div className="cmd">
        <div className="cmd-text" style={{ flex: '1 1 220px' }}>
          <strong>Buzzer sur détection</strong>
          <span>{act.auto
            ? 'Activé : le buzzer sonne quand le PIR détecte un mouvement (boîtier armé).'
            : 'Désactivé : alarme silencieuse, même en cas de détection. Seul le dashboard est prévenu.'}</span>
        </div>
        <div className="seg" role="group" aria-label="Buzzer sur détection">
          <button type="button" aria-pressed={act.auto} onClick={() => { if (!act.auto) s.toggleAuto(); }}>Activé</button>
          <button type="button" aria-pressed={!act.auto} onClick={() => { if (act.auto) s.toggleAuto(); }}>Désactivé</button>
        </div>
      </div>
    </section>
  );
}
