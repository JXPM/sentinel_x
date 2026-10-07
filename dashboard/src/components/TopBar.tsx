import { timeOf } from '../lib/format';
import type { Sentinel } from '../types';

export function TopBar({ title, s }: { title: string; s: Sentinel }) {
  const live = s.demo ? s.demo.playing : s.link === 'online';
  const label = s.demo ? (s.demo.playing ? 'En direct' : 'En pause') : s.link === 'online' ? 'Connecté' : 'Reconnexion…';
  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{title}</h1>
        <span>Boîtier sx-001 · micro-centrale de démonstration</span>
      </div>
      <div className="topbar-tools">
        <span className="live">
          <span className={'dot' + (live ? ' blink' : '')} style={{ background: live ? 'var(--ok)' : 'var(--text-3)' }} />
          {label} · {timeOf(s.now)}
        </span>
        {s.demo && (
          <button type="button" className="btn" aria-pressed={!s.demo.playing} onClick={s.demo.togglePlay}>
            {s.demo.playing ? 'Mettre en pause' : 'Reprendre'}
          </button>
        )}
      </div>
    </header>
  );
}
