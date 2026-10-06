import { forecast } from '../data/forecast';
import { etaText, fr, pathOf } from '../lib/format';
import { GAS_REF, LEVEL_BORDER, LEVEL_COLOR, LEVEL_TINT, TEMP_REF } from '../lib/levels';
import type { Sentinel } from '../types';

const CLASS_LABEL: Record<string, string> = {
  normal: 'Normal', overheat: 'Surchauffe', gas_leak: 'Fuite de gaz', combined: 'Combiné',
};

export function AiAnalysis({ s }: { s: Sentinel }) {
  const last = s.samples[s.samples.length - 1];
  if (!last) return null;
  const f = forecast(s.samples, s.secsPerSample);
  const reached = last.temp >= TEMP_REF || last.gas >= GAS_REF;
  const color = last.score >= 0.5 ? (reached ? LEVEL_COLOR.crit : LEVEL_COLOR.warn) : LEVEL_COLOR.ok;

  let kind = { type: 'Normal', proba: fr(0.9 - last.score * 0.4, 2) };
  if (s.aiClass) {
    kind = { type: CLASS_LABEL[s.aiClass.type] ?? s.aiClass.type, proba: fr(s.aiClass.proba, 2) };
  } else if (last.score >= 0.35) {
    const p = fr(0.55 + last.score * 0.4, 2);
    if (f.both) kind = { type: 'Combiné', proba: p };
    else if (last.gas >= GAS_REF || f.next?.kind === 'gas') kind = { type: 'Fuite de gaz', proba: p };
    else if (last.temp >= TEMP_REF || f.next?.kind === 'temp') kind = { type: 'Surchauffe', proba: p };
    else kind = { type: 'Indéterminé', proba: '0,50' };
  }

  const etaTitle = reached ? 'Niveau critique atteint' : f.next ? 'Incident dans ' + etaText(f.next.secs) : 'Aucun incident prévu';
  const etaSub = reached
    ? 'La référence est dépassée : agir maintenant.'
    : f.next ? 'Extrapolation de la tendance des 2 dernières minutes.' : 'Les tendances des 2 dernières minutes sont stables.';
  const etaLevel = reached ? 'crit' : f.next ? 'warn' : null;
  const window = s.samples.slice(-Math.round(300 / s.secsPerSample));

  return (
    <section className="card" aria-label="Analyse IA" style={{ gap: 20 }}>
      <div className="card-head">
        <h2>Analyse IA</h2>
        <span className="card-note">prédictive</span>
      </div>
      <div className="row">
        <div className="ai-score">
          <div className="ai-score-head"><span>Score d'anomalie</span><strong style={{ color }}>{fr(last.score, 2)}</strong></div>
          <div className="meter" role="meter" aria-label="Score d'anomalie" aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(last.score.toFixed(2))}>
            <span style={{ width: Math.round(last.score * 100) + '%', background: color }} />
          </div>
          <div className="scale"><span>0 normal</span><span>0,5 seuil appris</span><span>1 anormal</span></div>
          <svg className="spark" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
            <path d={pathOf(window.map((x) => x.score), 0, 1, 200, 40)} fill="none" stroke="#ECEBFF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="forecast" style={{ background: etaLevel ? LEVEL_TINT[etaLevel] : 'var(--card-muted)', borderColor: etaLevel ? LEVEL_BORDER[etaLevel] : 'var(--line)' }}>
          <span className="kicker">PRÉVISION</span>
          <strong>{etaTitle}</strong>
          <span>{etaSub}</span>
        </div>
        <div className="mini-cards">
          <div className="mini-card"><span>Type d'incident</span><strong>{kind.type}</strong><span>Random Forest · {kind.proba}</span></div>
          <div className="mini-card"><span>Détection</span><strong>{last.score >= 0.5 ? 'Anomalie' : 'Normal'}</strong><span>Isolation Forest</span></div>
        </div>
      </div>
      <span className="footnote">Aucune règle à seuil fixe : l'alerte vient du modèle entraîné sur les données normales. Les pointillés rouges ne sont qu'un repère pour la prévision.</span>
    </section>
  );
}
