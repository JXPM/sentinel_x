import { useEffect, useState } from 'react';
import { fetchSettings, saveSettings } from '../data/api';
import { LCD_MAX, lcdSafe } from '../lib/lcd';
import type { Rule, RuleEvent, Sentinel, Settings, SettingsResponse } from '../types';
import { Icon } from './Icon';

// Onglet « Règles » : seuils de la vision, heures ouvrées et réactions automatiques du boîtier.
// GET/PUT /api/v1/settings (app/settings.py) ; la vision applique les seuils sans redémarrer.

const EVENTS: { id: RuleEvent; label: string }[] = [
  { id: 'danger_object', label: 'Objet dangereux tenu par une personne' },
  { id: 'intrusion_confirmed', label: 'Intrusion confirmée (PIR + caméra)' },
  { id: 'off_hours', label: 'Présence hors horaires' },
  { id: 'person', label: 'Personne vue par la caméra' },
  { id: 'loitering', label: 'Présence prolongée' },
  { id: 'abandoned', label: 'Objet abandonné' },
  { id: 'motion', label: 'Mouvement détecté par le PIR' },
  { id: 'overheat', label: 'Surchauffe' },
  { id: 'gas_leak', label: 'Fumée ou gaz' },
  { id: 'anomaly', label: 'Anomalie détectée par l’IA' },
  { id: 'any_critical', label: 'Toute alerte critique' },
];
const BUZZ_CHOICES = [0, 500, 1000, 2000, 3000, 5000, 10000];
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Mode simulation (pas d'API) : mêmes valeurs par défaut que app/settings.py
const MOCK_DEFAULTS: Settings = {
  vision: { loiter_s: 30, abandon_s: 20, confirm: 3, person_conf: 0.5, obj_conf: 0.35 },
  hours: { start: '08:30', end: '17:00', days: [0, 1, 2, 3, 4] },
  rules: {
    enabled: true, cooldown_s: 15, items: [
      { id: 'danger', name: 'Objet dangereux', event: 'danger_object', enabled: true, buzzer_ms: 3000, lcd_text: 'OBJET DANGEREUX', lcd_s: 10 },
      { id: 'intrusion', name: 'Intrusion confirmée', event: 'intrusion_confirmed', enabled: true, buzzer_ms: 2000, lcd_text: 'INTRUSION', lcd_s: 10 },
      { id: 'horaires', name: 'Présence hors horaires', event: 'off_hours', enabled: true, buzzer_ms: 1000, lcd_text: 'ZONE SURVEILLEE', lcd_s: 10 },
      { id: 'chaleur', name: 'Surchauffe (sans buzzer)', event: 'overheat', enabled: true, buzzer_ms: 0, lcd_text: 'SURCHAUFFE', lcd_s: 15 },
    ],
  },
};

const clone = (s: Settings): Settings => JSON.parse(JSON.stringify(s)) as Settings;
const same = (a: Settings | null, b: Settings | null) => JSON.stringify(a) === JSON.stringify(b);
const secsText = (ms: number) => (ms === 0 ? 'Pas de buzzer' : (ms / 1000).toString().replace('.', ',') + ' s');

/** Heure de Paris, comme le serveur et la vision. */
function offHoursNow(h: Settings['hours']): boolean {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].indexOf(get('weekday'));
  const hhmm = get('hour').padStart(2, '0') + ':' + get('minute');
  return !h.days.includes(day) || !(h.start <= hhmm && hhmm < h.end);
}

function NumberField({ label, hint, value, min, max, step = 1, unit, onChange }: {
  label: string; hint: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="field setting">
      <span>{label}</span>
      <span className="input-unit">
        <input type="number" inputMode="decimal" value={value} min={min} max={max} step={step}
          onChange={(e) => onChange(e.target.value === '' ? min : Number(e.target.value))} />
        {unit && <span>{unit}</span>}
      </span>
      <small>{hint} ({min} à {max})</small>
    </label>
  );
}

function RuleRow({ rule, onChange, onDelete }: { rule: Rule; onChange: (r: Rule) => void; onDelete: () => void }) {
  const set = <K extends keyof Rule>(k: K, v: Rule[K]) => onChange({ ...rule, [k]: v });
  const label = 'Règle ' + (rule.name || 'sans nom');
  return (
    <div className={'rule' + (rule.enabled ? '' : ' off')} role="group" aria-label={label}>
      <div className="rule-head">
        <button type="button" className="switch" role="switch" aria-checked={rule.enabled} aria-label={(rule.enabled ? 'Désactiver ' : 'Activer ') + label}
          onClick={() => set('enabled', !rule.enabled)}><span /></button>
        <input className="rule-name" type="text" value={rule.name} maxLength={60} aria-label="Nom de la règle" onChange={(e) => set('name', e.target.value)} />
        <button type="button" className="icon-btn" aria-label={'Supprimer ' + label} onClick={onDelete}><Icon name="trash" size={18} /></button>
      </div>
      <div className="rule-grid">
        <label className="field wide">
          <span>Quand</span>
          <select value={rule.event} onChange={(e) => set('event', e.target.value as RuleEvent)}>
            {EVENTS.map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Buzzer</span>
          <select value={rule.buzzer_ms} onChange={(e) => set('buzzer_ms', Number(e.target.value))}>
            {[...new Set([...BUZZ_CHOICES, rule.buzzer_ms])].sort((a, b) => a - b).map((ms) => <option key={ms} value={ms}>{secsText(ms)}</option>)}
          </select>
        </label>
        <label className="field grow">
          <span>Texte sur l’écran ({lcdSafe(rule.lcd_text).length}/{LCD_MAX}, vide = rien)</span>
          <input type="text" value={rule.lcd_text} maxLength={64} placeholder="ex. ZONE SURVEILLEE" onChange={(e) => set('lcd_text', e.target.value)} />
        </label>
        <label className="field">
          <span>Pendant</span>
          <select value={rule.lcd_s} onChange={(e) => set('lcd_s', Number(e.target.value))} disabled={!rule.lcd_text.trim()}>
            {[...new Set([3, 5, 10, 15, 20, 30, rule.lcd_s])].sort((a, b) => a - b).map((s) => <option key={s} value={s}>{s} s</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

export function RulesPage({ s }: { s: Sentinel }) {
  const mock = s.mode === 'mock';
  const [meta, setMeta] = useState<SettingsResponse | null>(null);
  const [saved, setSaved] = useState<Settings | null>(() => (mock ? clone(MOCK_DEFAULTS) : null));
  const [draft, setDraft] = useState<Settings | null>(() => (mock ? clone(MOCK_DEFAULTS) : null));
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mock) return;
    let alive = true;
    fetchSettings()
      .then((r) => { if (!alive) return; setMeta(r); setSaved(r.settings); setDraft(clone(r.settings)); })
      .catch((e: Error) => { if (alive) setStatus({ kind: 'error', text: 'Réglages illisibles : ' + e.message }); });
    return () => { alive = false; };
  }, [mock]);

  if (!draft) {
    return (
      <section className="card narrow" aria-label="Règles et seuils">
        <h2>Règles et seuils</h2>
        <p className={status?.kind === 'error' ? 'error-line' : 'footnote'} role="status">{status?.text ?? 'Chargement des réglages…'}</p>
      </section>
    );
  }

  const dirty = !same(draft, saved);
  const defaults = meta?.defaults ?? MOCK_DEFAULTS;
  const setVision = (k: keyof Settings['vision'], v: number) => setDraft({ ...draft, vision: { ...draft.vision, [k]: v } });
  const setHours = (h: Partial<Settings['hours']>) => setDraft({ ...draft, hours: { ...draft.hours, ...h } });
  const setRules = (r: Partial<Settings['rules']>) => setDraft({ ...draft, rules: { ...draft.rules, ...r } });
  const setRule = (i: number, rule: Rule) => setRules({ items: draft.rules.items.map((x, j) => (j === i ? rule : x)) });
  const toggleDay = (d: number) =>
    setHours({ days: draft.hours.days.includes(d) ? draft.hours.days.filter((x) => x !== d) : [...draft.hours.days, d].sort() });
  const hoursOk = draft.hours.start < draft.hours.end;
  const offNow = offHoursNow(draft.hours);

  const save = () => {
    if (!hoursOk) {
      setStatus({ kind: 'error', text: 'Le début des heures ouvrées doit précéder la fin.' });
      return;
    }
    if (mock) {
      setSaved(clone(draft));
      setStatus({ kind: 'info', text: 'Mode simulation : réglages gardés dans la page seulement.' });
      return;
    }
    setBusy(true);
    saveSettings(draft)
      .then((r) => {
        setMeta(r);
        setSaved(r.settings);
        setDraft(clone(r.settings));
        const where = [r.persisted ? 'enregistrés en base' : 'appliqués, mais NON enregistrés (base indisponible)',
          r.vision_sent ? 'transmis à la caméra' : 'caméra non prévenue (broker MQTT injoignable)'];
        setStatus({ kind: r.persisted && r.vision_sent ? 'ok' : 'error', text: 'Réglages ' + where.join(', ') + '.' });
      })
      .catch((e: Error) => setStatus({ kind: 'error', text: 'Refusé par le serveur : ' + e.message }))
      .finally(() => setBusy(false));
  };

  const updated = meta?.updated_at
    ? 'Modifié le ' + new Date(meta.updated_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + ' par ' + (meta.updated_by ?? '?')
    : mock ? 'Simulation : rien n’est envoyé au serveur' : 'Valeurs par défaut, jamais modifiées';

  return (
    <div className="col rules-page">
      <section className="card narrow" aria-label="Seuils de la caméra">
        <div className="card-head">
          <h2>Détection caméra</h2>
          <span className="card-note">{updated}</span>
        </div>
        <p className="footnote">Appliqué à chaud par le service vision, sans redémarrage.</p>
        <div className="settings-grid">
          <NumberField label="Présence prolongée" hint="Alerte si une personne reste plus de" unit="s" min={5} max={600}
            value={draft.vision.loiter_s} onChange={(v) => setVision('loiter_s', v)} />
          <NumberField label="Objet abandonné" hint="Alerte si un sac reste seul plus de" unit="s" min={5} max={600}
            value={draft.vision.abandon_s} onChange={(v) => setVision('abandon_s', v)} />
          <NumberField label="Confirmation" hint="Images consécutives avant d’alerter" unit="images" min={1} max={10}
            value={draft.vision.confirm} onChange={(v) => setVision('confirm', v)} />
          <NumberField label="Confiance personne" hint="Score YOLO minimal" min={0.2} max={0.95} step={0.05}
            value={draft.vision.person_conf} onChange={(v) => setVision('person_conf', v)} />
          <NumberField label="Confiance objet" hint="Score minimal couteau, ciseaux, sac…" min={0.2} max={0.95} step={0.05}
            value={draft.vision.obj_conf} onChange={(v) => setVision('obj_conf', v)} />
        </div>
      </section>

      <section className="card narrow" aria-label="Heures ouvrées">
        <div className="card-head">
          <h2>Heures ouvrées</h2>
          <span className={'state-chip ' + (offNow ? 'crit' : 'ok')}>{offNow ? 'En ce moment : hors horaires' : 'En ce moment : heures ouvrées'}</span>
        </div>
        <p className="footnote">En dehors de ces plages (heure de Paris), une présence passe directement en <strong>critique</strong>, comme la présence prolongée et l’objet abandonné.</p>
        <div className="hours-row">
          <label className="field"><span>Début</span><input type="time" value={draft.hours.start} onChange={(e) => setHours({ start: e.target.value })} /></label>
          <label className="field"><span>Fin</span><input type="time" value={draft.hours.end} onChange={(e) => setHours({ end: e.target.value })} /></label>
          <div className="field">
            <span id="days-label">Jours ouvrés</span>
            <div className="seg days" role="group" aria-labelledby="days-label">
              {DAYS.map((d, i) => (
                <button key={d} type="button" aria-pressed={draft.hours.days.includes(i)} onClick={() => toggleDay(i)}>{d}</button>
              ))}
            </div>
          </div>
        </div>
        {!hoursOk && <p className="error-line" role="alert">Le début doit précéder la fin (une plage de nuit n’est pas gérée).</p>}
      </section>

      <section className="card narrow" aria-label="Réactions automatiques">
        <div className="card-head">
          <h2>Réactions automatiques</h2>
          <div className="row" style={{ alignItems: 'center', gap: 12 }}>
            <span className="card-note">{draft.rules.enabled ? 'Actives' : 'Toutes coupées'}</span>
            <button type="button" className="switch" role="switch" aria-checked={draft.rules.enabled} aria-label="Réactions automatiques"
              onClick={() => setRules({ enabled: !draft.rules.enabled })}><span /></button>
          </div>
        </div>
        <p className="footnote">Les règles décident de la <strong>réaction</strong> du boîtier (buzzer, texte sur l’écran), jamais de la détection : l’alerte vient toujours de la caméra, du PIR ou du modèle IA.</p>
        <NumberField label="Délai entre deux déclenchements" hint="Une même règle ne se redéclenche pas avant" unit="s" min={0} max={600}
          value={draft.rules.cooldown_s} onChange={(v) => setRules({ cooldown_s: v })} />
        <div className={'col rules-list' + (draft.rules.enabled ? '' : ' off')} style={{ gap: 12 }}>
          {draft.rules.items.length === 0 && <p className="footnote">Aucune règle : le boîtier ne réagit qu’aux commandes manuelles.</p>}
          {draft.rules.items.map((r, i) => (
            <RuleRow key={r.id ?? 'new-' + i} rule={r} onChange={(nr) => setRule(i, nr)}
              onDelete={() => setRules({ items: draft.rules.items.filter((_, j) => j !== i) })} />
          ))}
        </div>
        <button type="button" className="btn btn-start" disabled={draft.rules.items.length >= 20}
          onClick={() => setRules({ items: [...draft.rules.items, { name: 'Nouvelle règle', event: 'any_critical', enabled: true, buzzer_ms: 1000, lcd_text: '', lcd_s: 5 }] })}>
          <Icon name="plus" size={18} /> Ajouter une règle
        </button>
      </section>

      <div className="save-bar narrow" role="region" aria-label="Enregistrement des réglages">
        <p className={'grow ' + (status?.kind === 'error' ? 'save-error' : status?.kind === 'ok' ? 'save-ok' : 'footnote')} role="status">
          {status?.text ?? (dirty ? 'Modifications non enregistrées.' : 'Aucune modification.')}
        </p>
        <button type="button" className="btn" onClick={() => { setDraft(clone(defaults)); setStatus(null); }}>Valeurs par défaut</button>
        <button type="button" className="btn" disabled={!dirty || busy} onClick={() => { if (saved) setDraft(clone(saved)); setStatus(null); }}>Annuler</button>
        <button type="button" className="btn btn-primary btn-lg" disabled={!dirty || busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </div>
  );
}
