import type { Scenario } from '../types';

const SCENARIOS: [Scenario, string][] = [
  ['nominal', 'Normal'],
  ['overheat', 'Surchauffe lente'],
  ['gas', 'Fuite de gaz'],
  ['intrusion', 'Intrusion'],
];

export function ScenarioBar({ value, onChange }: { value: Scenario; onChange: (s: Scenario) => void }) {
  return (
    <section className="scenario" aria-label="Scénario de démonstration">
      <span className="scenario-label">SCÉNARIO DE DÉMO</span>
      <div className="scenario-list" role="group" aria-label="Choisir un scénario">
        {SCENARIOS.map(([id, label]) => (
          <button key={id} type="button" className="chip-btn" aria-pressed={value === id} onClick={() => onChange(id)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
