import { LEVEL_BORDER, LEVEL_COLOR, LEVEL_TINT } from '../lib/levels';
import type { Sentinel } from '../types';
import { Icon } from './Icon';

export function StatusBanner({ s }: { s: Sentinel }) {
  const { banner } = s;
  const color = LEVEL_COLOR[banner.level];
  const unacked = s.alerts.some((a) => !a.acked);
  return (
    <div
      role="status"
      aria-live="polite"
      className={'banner' + (banner.level === 'crit' ? ' pulse' : '')}
      style={{ background: LEVEL_TINT[banner.level], borderColor: LEVEL_BORDER[banner.level] }}
    >
      <span className="banner-icon" style={{ background: color }}>
        <Icon name={banner.level} size={28} />
      </span>
      <div className="banner-text">
        <span className="banner-kicker" style={{ color }}>{banner.kicker}</span>
        <span className="banner-title">{banner.title}</span>
        <span className="banner-sub">{banner.sub}</span>
      </div>
      {banner.level === 'crit' && (
        <button type="button" className="btn btn-lg btn-danger" onClick={s.buzz} disabled={s.actuators.buzzing}>
          <Icon name="speaker" size={18} />
          {s.actuators.buzzing ? 'Le buzzer sonne…' : 'Faire sonner le buzzer (2 s)'}
        </button>
      )}
      {banner.level === 'warn' && unacked && (
        <button type="button" className="btn btn-lg btn-primary" onClick={s.ackAll}>
          <Icon name="check" size={18} />
          Acquitter
        </button>
      )}
    </div>
  );
}
