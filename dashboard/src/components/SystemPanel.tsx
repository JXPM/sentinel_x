import type { Sentinel } from '../types';
import { Icon } from './Icon';

const STATE_COLOR = { ok: 'var(--ok)', down: 'var(--crit)', unknown: 'var(--text-3)' } as const;

export function SystemPanel({ s }: { s: Sentinel }) {
  return (
    <section id="systeme" className="card narrow" aria-label="État du système" style={{ gap: 12 }}>
      <h2 style={{ marginBottom: 4 }}>Services de la micro-centrale</h2>
      {s.services.map((row) => (
        <div key={row.name} className="svc">
          <Icon name={row.state === 'down' ? 'crit' : 'checkCircle'} size={18} stroke={STATE_COLOR[row.state]} />
          <div className="svc-text"><span>{row.name}</span><span>{row.detail}</span></div>
          <span className="svc-value">{row.value}</span>
        </div>
      ))}
    </section>
  );
}
