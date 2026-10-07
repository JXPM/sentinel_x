import { timeOf } from '../lib/format';
import { LEVEL_BORDER, LEVEL_COLOR } from '../lib/levels';
import { objectLabel } from '../data/useSentinel';
import type { Sentinel } from '../types';

// Graduations des règles latérales (une grande toutes les 5)
let TICKS = '';
for (let i = 0; i <= 20; i++) TICKS += 'M0 ' + i * 5 + ' H' + (i % 5 === 0 ? 12 : 6) + ' ';

const pct = (v: number, of: number) => ((v / of) * 100).toFixed(1) + '%';

export function VisionCard({ s }: { s: Sentinel }) {
  const v = s.vision;
  const [SRC_W, SRC_H] = v.frame;
  const locked = v.person && v.confirmFrames >= v.confirmNeeded;
  const mode = !v.online ? 'HORS LIGNE' : v.person ? (locked ? 'CIBLE VERROUILLÉE' : 'ACQUISITION') : 'BALAYAGE';
  const accent = !v.online ? LEVEL_COLOR.warn : v.person ? LEVEL_COLOR.crit : LEVEL_COLOR.ok;
  const accentBorder = !v.online ? LEVEL_BORDER.warn : v.person ? LEVEL_BORDER.crit : LEVEL_BORDER.ok;
  const ms = v.ms != null ? v.ms + ' ms' : '— ms';
  const fps = v.fps != null ? v.fps + ' FPS' : '— FPS';
  const confirm = v.confirmFrames + '/' + v.confirmNeeded + ' images';
  const frame = String(Math.floor(s.now / 1000) * 26 % 10000000).padStart(7, '0');
  const box = v.bbox;
  // Fiche de cible à gauche de la boîte si la cible est sur la moitié droite
  const flip = box ? (box[0] + box[2]) / 2 > SRC_W * 0.55 : false;
  // Boîte collée en haut de l'image : l'étiquette passe dedans pour ne pas couvrir le HUD
  const labelInside = box ? box[1] < SRC_H * 0.15 : false;
  const pir = Boolean(s.samples[s.samples.length - 1]?.presence);
  const summary = !v.online
    ? 'Caméra hors ligne : le service vision ne répond pas'
    : v.person
      ? 'Flux caméra : une personne détectée, confiance ' + v.conf.toFixed(2).replace('.', ',')
      : 'Flux caméra : aucune personne détectée';

  return (
    <section id="vision" className="card" aria-label="Vision IA" style={{ flex: '2 1 560px' }}>
      <div className="card-head">
        <h2>Vision IA · cam-01</h2>
        <span className="mode-chip" style={{ color: accent, borderColor: accentBorder }}>{mode}</span>
      </div>

      <div className={'cam' + (v.person ? ' locked' : '') + (s.mode === 'api' ? ' real' : '')} role="img" aria-label={summary}>
        {s.videoUrl && (
          // Flux coupé : on masque l'image cassée, le HUD reste lisible
          <img className="cam-video" src={s.videoUrl} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
        )}
        {!v.online && (
          <div className="cam-offline">
            <strong>CAMÉRA HORS LIGNE</strong>
            <span>Lancer le service vision : <code>python detect.py --source c270</code></span>
          </div>
        )}
        <div className="cam-grid" />
        <div className="cam-vignette" />
        <span className="cam-scan" />
        <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
        <svg className="ruler left" viewBox="0 0 12 100" preserveAspectRatio="none" aria-hidden="true"><path d={TICKS} stroke="#9C95FF" strokeOpacity={0.55} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" /></svg>
        <svg className="ruler right" viewBox="0 0 12 100" preserveAspectRatio="none" aria-hidden="true"><path d={TICKS} stroke="#9C95FF" strokeOpacity={0.55} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" /></svg>
        <svg className="reticle" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
          <circle cx="36" cy="36" r="14" fill="none" stroke="#9C95FF" strokeOpacity={0.45} strokeWidth={1} />
          <path d="M36 0v18 M36 54v18 M0 36h18 M54 36h18" stroke="#9C95FF" strokeOpacity={0.45} strokeWidth={1} />
          <circle cx="36" cy="36" r="1.5" fill="#C9C5FF" />
        </svg>

        <div className="hud-block tl">
          <span className="rec"><span className="dot blink" />REC · CAM-01 · SX-001</span>
          <span className="hud-dim">{s.mode === 'mock' ? 'FLUX MJPEG SIMULÉ' : 'FLUX MJPEG'} · {SRC_W}×{SRC_H}</span>
        </div>
        <div className="hud-block tr">
          <span className="hud-strong">T {timeOf(s.now)}</span>
          <span className="hud-dim">IMG {frame}</span>
        </div>
        <div className="hud-block bl">
          <span className="hud-dim">YOLOV8N · ONNX 320</span>
          <span className="hud-strong">INF {ms} · {fps}</span>
        </div>
        <div className="hud-block br">
          <span className="hud-dim">CONFIRMATION</span>
          <span style={{ color: accent }}>{confirm}</span>
        </div>

        {v.person && box && (
          <div className={'target' + (labelInside ? ' label-inside' : '')} style={{ left: pct(box[0], SRC_W), top: pct(box[1], SRC_H), width: pct(box[2] - box[0], SRC_W), height: pct(box[3] - box[1], SRC_H) }}>
            {!s.videoUrl && (
              <svg className="silhouette" viewBox="0 0 100 300" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
                <circle cx="50" cy="46" r="26" fill="rgba(201,197,255,.14)" stroke="rgba(201,197,255,.3)" strokeWidth={1.5} />
                <path d="M8 300 C8 172 24 106 50 98 C76 106 92 172 92 300 Z" fill="rgba(201,197,255,.14)" stroke="rgba(201,197,255,.3)" strokeWidth={1.5} />
              </svg>
            )}
            <span className="tick tl" /><span className="tick tr" /><span className="tick bl" /><span className="tick br" />
            <span className="target-center" />
            <span className="target-label">PERSONNE {v.conf.toFixed(2).replace('.', ',')} · TRK-01</span>
            <div className={'target-card' + (flip ? ' flip' : '')}>
              <span style={{ color: 'var(--crit)' }}>{locked ? 'CIBLE VERROUILLÉE' : 'CIBLE EN ACQUISITION'}</span>
              <span className="hud-strong">X {Math.round((box[0] + box[2]) / 2)} · Y {Math.round((box[1] + box[3]) / 2)}</span>
              <span className="hud-strong">BOÎTE {Math.round(box[2] - box[0])}×{Math.round(box[3] - box[1])} px</span>
              <span className="hud-dim">PIR {pir ? 'MOUVEMENT' : 'CALME'}</span>
            </div>
          </div>
        )}
        {v.infoObjects.map((o, i) => (
          <div key={'i' + i} className="info-box" style={{ left: pct(o.bbox[0], SRC_W), top: pct(o.bbox[1], SRC_H), width: pct(o.bbox[2] - o.bbox[0], SRC_W), height: pct(o.bbox[3] - o.bbox[1], SRC_H) }}>
            <span className="info-label">{objectLabel(o.label).toUpperCase()} {o.conf.toFixed(2).replace('.', ',')}</span>
          </div>
        ))}
        {v.objects.map((o, i) => (
          <div key={i} className="danger-box" style={{ left: pct(o.bbox[0], SRC_W), top: pct(o.bbox[1], SRC_H), width: pct(o.bbox[2] - o.bbox[0], SRC_W), height: pct(o.bbox[3] - o.bbox[1], SRC_H) }}>
            <span className="danger-label">{objectLabel(o.label).toUpperCase()} {o.conf.toFixed(2).replace('.', ',')}</span>
          </div>
        ))}
        {!v.online ? null : v.threat ? (
          <div className="hud-strip alert">OBJET DANGEREUX · {objectLabel(v.objects[0]?.label ?? '').toUpperCase()}</div>
        ) : v.abandoned ? (
          <div className="hud-strip warn">OBJET ABANDONNÉ · {Math.round(v.abandonedSecs)} S</div>
        ) : v.person ? (
          <div className="hud-strip alert">{!locked ? 'PRÉSENCE DÉTECTÉE · CONFIRMATION EN COURS' : pir ? 'INTRUSION CONFIRMÉE · PIR + CAMÉRA' : v.loitering ? 'PRÉSENCE PROLONGÉE · ' + Math.round(v.presentSecs) + ' S' : 'PRÉSENCE CONFIRMÉE · CAMÉRA'}</div>
        ) : (
          <span className="hud-strip idle">BALAYAGE · AUCUNE CIBLE</span>
        )}
      </div>

      <div className="cam-stats">
        <div><span>Inférence</span><span>{ms}</span></div>
        <div><span>Débit</span><span>{fps}</span></div>
        <div><span>Confirmation</span><span>{confirm}</span></div>
      </div>
    </section>
  );
}
