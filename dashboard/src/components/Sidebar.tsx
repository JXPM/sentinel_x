import { REPLAY_SPEEDUP } from '../data/replay';
import type { Sentinel, TabId } from '../types';
import { TABS } from '../lib/tabs';
import { Icon } from './Icon';


interface Props {
  tab: TabId;
  onTab: (t: TabId) => void;
  unacked: number;
  sensors: Sentinel['sensors'];
}

export function Sidebar({ tab, onTab, unacked, sensors }: Props) {
  const unackedLabel = unacked + (unacked > 1 ? ' alertes à traiter' : ' alerte à traiter');
  return (
    <nav className="sidebar" aria-label="Navigation principale">
      <div className="brand">
        <img src="/logo.png" alt="" />
        <div className="brand-name">
          <strong>SENTINEL-X</strong>
          <span>AetherCorp</span>
        </div>
      </div>
      <div className="nav">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="nav-item" aria-current={tab === t.id ? 'page' : undefined} onClick={() => onTab(t.id)}>
            <Icon name={t.icon} />
            <span className="grow">{t.label}</span>
            {t.id === 'alertes' && unacked > 0 && <span className="badge" aria-label={unackedLabel}>{unacked}</span>}
          </button>
        ))}
      </div>
      {sensors === 'demo' && (
        <div className="sim-note">
          <span className="mono">DONNÉES SIMULÉES</span>
          <span>Mock aligné sur le contrat de l'API. 1 s affichée = 5 s simulées.</span>
        </div>
      )}
      {sensors === 'replay' && (
        <div className="sim-note">
          <span className="mono">CAPTEURS EN REJEU</span>
          <span>Jeu de données de la filière IA en attendant l'ESP, lu ×{REPLAY_SPEEDUP}. Caméra et alertes réelles.</span>
        </div>
      )}
    </nav>
  );
}
