import { alertView } from '../lib/alerts';
import type { Alert } from '../types';
import { Icon } from './Icon';

export function AlertItem({ alert, compact = false, onAck }: { alert: Alert; compact?: boolean; onAck?: (id: number) => void }) {
  const v = alertView(alert);
  return (
    <div className={'alert' + (compact ? ' compact' : '')} style={{ background: v.bg, borderColor: v.border, opacity: v.opacity }}>
      <span className="alert-icon" style={{ background: v.color }}><Icon name={v.level} size={compact ? 16 : 18} /></span>
      <div className="alert-body">
        <strong>{v.title}</strong>
        {!compact && <span className="alert-msg">{alert.message}</span>}
        <span className="alert-meta">{v.meta}</span>
      </div>
      {onAck && !alert.acked && (
        <button type="button" className="btn btn-sm" onClick={() => onAck(alert.id)} aria-label={'Acquitter : ' + v.title}>Acquitter</button>
      )}
      {onAck && alert.acked && (
        <span className="acked"><Icon name="check" size={16} stroke="var(--ok)" />Acquittée</span>
      )}
    </div>
  );
}
