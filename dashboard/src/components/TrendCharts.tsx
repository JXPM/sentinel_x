import { fr, pathOf } from '../lib/format';
import { GAS_REF, TEMP_REF } from '../lib/levels';
import type { Sample, Sentinel } from '../types';

interface ChartDef {
  label: string;
  key: 'temp' | 'gas';
  min: number;
  max: number;
  ref: number;
  refLabel: string;
  color: string;
  fill: string;
  unit: string;
  dec: number;
}

const CHARTS: ChartDef[] = [
  { label: 'Température', key: 'temp', min: 15, max: 45, ref: TEMP_REF, refLabel: 'référence 40 °C', color: '#FF9466', fill: 'rgba(255,148,102,.08)', unit: '°C', dec: 1 },
  { label: 'Gaz (indice brut MQ-2)', key: 'gas', min: 0, max: 500, ref: GAS_REF, refLabel: 'référence 400', color: '#827AFF', fill: 'rgba(130,122,255,.10)', unit: '', dec: 0 },
];

function Chart({ def, samples }: { def: ChartDef; samples: Sample[] }) {
  const vals = samples.map((x) => x[def.key]);
  const line = pathOf(vals, def.min, def.max, 600, 200);
  const refY = (200 - ((def.ref - def.min) / (def.max - def.min)) * 200).toFixed(1);
  const now = vals.length ? fr(vals[vals.length - 1], def.dec) + (def.unit ? ' ' + def.unit : '') : '—';
  return (
    <figure className="chart" aria-label={def.label + ' : ' + now + ' maintenant'}>
      <figcaption>
        <span className="legend main"><span className="swatch" style={{ background: def.color }} />{def.label}</span>
        <span className="legend ref"><span className="dash" />{def.refLabel}</span>
        <span className="chart-now">{now}</span>
      </figcaption>
      <div className="chart-body">
        <div className="chart-axis"><span>{def.max}</span><span>{(def.min + def.max) / 2}</span><span>{def.min}</span></div>
        <div className="chart-plot">
          <svg viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
            {line && <path d={line + ' L600 200 L0 200 Z'} fill={def.fill} stroke="none" />}
            <line x1="0" x2="600" y1={refY} y2={refY} stroke="#FF5C7A" strokeWidth={1.5} strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
            {line && <path d={line} fill="none" stroke={def.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          </svg>
        </div>
      </div>
      <div className="chart-x"><span>−10 min</span><span>−5 min</span><span>maintenant</span></div>
    </figure>
  );
}

export function TrendCharts({ s }: { s: Sentinel }) {
  const window = s.samples.slice(-Math.round(600 / s.secsPerSample));
  return (
    <section className="card" aria-label="Courbes des 10 dernières minutes" style={{ gap: 20 }}>
      <div className="card-head">
        <h2>Tendances · 10 dernières minutes</h2>
        <span className="card-note">une mesure toutes les {s.secsPerSample} s</span>
      </div>
      {CHARTS.map((d) => <Chart key={d.key} def={d} samples={window} />)}
    </section>
  );
}
