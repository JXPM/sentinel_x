import { useEffect, useState } from 'react';
import { AiAnalysis } from './components/AiAnalysis';
import { AlertsPage } from './components/AlertsPage';
import { CommandsPanel } from './components/CommandsPanel';
import { OverviewSide } from './components/OverviewSide';
import { RulesPage } from './components/RulesPage';
import { ScenarioBar } from './components/ScenarioBar';
import { SensorTiles } from './components/SensorTiles';
import { Sidebar } from './components/Sidebar';
import { TABS } from './lib/tabs';
import { StatusBanner } from './components/StatusBanner';
import { SystemPanel } from './components/SystemPanel';
import { TopBar } from './components/TopBar';
import { TrendCharts } from './components/TrendCharts';
import { VisionCard } from './components/VisionCard';
import { useSentinel } from './data/useSentinel';
import type { TabId } from './types';

// L'onglet actif est gardé dans l'URL (#alertes…) : rechargement et lien direct conservent la vue.
const tabFromHash = (): TabId => {
  const h = window.location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as TabId) : 'supervision';
};

export default function App() {
  const s = useSentinel();
  const [tab, setTab] = useState<TabId>(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goTo = (t: TabId) => {
    window.history.replaceState(null, '', '#' + t);
    setTab(t);
  };

  const title = TABS.find((t) => t.id === tab)?.title ?? '';
  const unacked = s.alerts.filter((a) => !a.acked).length;

  useEffect(() => { document.title = title + ' · Sentinel-X'; }, [title]);

  return (
    <div className="shell">
      <Sidebar tab={tab} onTab={goTo} unacked={unacked} sensors={s.sensors} />
      <main className="content">
        <TopBar title={title} s={s} />
        {s.demo && <ScenarioBar value={s.demo.scenario} onChange={s.demo.setScenario} />}
        <StatusBanner s={s} />
        {s.commandError && <p className="error-line" role="alert">{s.commandError}</p>}

        {(tab === 'supervision' || tab === 'capteurs') && <SensorTiles s={s} />}

        {(tab === 'supervision' || tab === 'vision') && (
          <div className="row">
            <VisionCard s={s} />
            {tab === 'supervision' && <OverviewSide s={s} onTab={goTo} />}
          </div>
        )}

        {tab === 'supervision' && <AiAnalysis s={s} />}
        {tab === 'capteurs' && <TrendCharts s={s} />}
        {tab === 'alertes' && <AlertsPage s={s} />}
        {tab === 'commandes' && <CommandsPanel s={s} />}
        {tab === 'regles' && <RulesPage s={s} />}
        {tab === 'systeme' && <SystemPanel s={s} />}
      </main>
    </div>
  );
}
