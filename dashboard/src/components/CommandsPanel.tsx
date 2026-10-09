import { useState } from 'react';
import type { Sentinel } from '../types';
import { LCD_COLS, LCD_MAX, lcdLines, lcdSafe } from '../lib/lcd';

const LCD_DURATIONS = [3, 5, 10, 20, 30];

function LcdCommand({ s }: { s: Sentinel }) {
  const [text, setText] = useState('');
  const [secs, setSecs] = useState(10);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const safe = lcdSafe(text);
  const [l1, l2] = lcdLines(safe);
  const lost = text.trim().length > 0 && safe.length < Math.min(text.trim().length, LCD_MAX);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!safe || state === 'sending') return;
    setState('sending');
    s.sendLcd(safe, secs).then((ok) => setState(ok ? 'sent' : 'failed'));
  };

  return (
    <form className="cmd lcd-cmd" onSubmit={submit}>
      <div className="cmd-text" style={{ flex: '1 1 260px' }}>
        <strong>Texte sur l’écran <span className="pin">LCD 16×2 · I2C</span></strong>
        <span>Affiché {secs} s sur le boîtier, puis retour à l’écran normal. Accents retirés : l’écran ne les affiche pas.</span>
      </div>
      <div className="lcd" aria-label={'Aperçu de l’écran : ' + (safe || 'vide')}>
        <span>{l1.padEnd(LCD_COLS, ' ')}</span>
        <span>{l2.padEnd(LCD_COLS, ' ')}</span>
      </div>
      <div className="lcd-form">
        <label className="field grow">
          <span>Texte ({safe.length}/{LCD_MAX})</span>
          <input
            type="text" value={text} maxLength={64} placeholder="Bonjour le jury" autoComplete="off"
            onChange={(e) => { setText(e.target.value); setState('idle'); }}
          />
        </label>
        <label className="field">
          <span>Durée</span>
          <select value={secs} onChange={(e) => setSecs(Number(e.target.value))}>
            {LCD_DURATIONS.map((d) => <option key={d} value={d}>{d} s</option>)}
          </select>
        </label>
        <button type="submit" className="btn btn-primary btn-lg" disabled={!safe || state === 'sending'}>
          {state === 'sending' ? 'Envoi…' : 'Afficher sur le boîtier'}
        </button>
      </div>
      <p className="form-note" role="status">
        {state === 'sent' ? 'Texte envoyé au boîtier.' : state === 'failed' ? 'Texte non transmis, voir le message en haut de page.' : lost ? 'Les caractères non affichables (emoji, symboles) seront retirés.' : ' '}
      </p>
    </form>
  );
}

export function CommandsPanel({ s }: { s: Sentinel }) {
  const { actuators: act } = s;
  const buzzHint = act.buzzing
    ? act.buzzAuto ? 'Déclenché automatiquement par l’intrusion' : 'Commande envoyée au boîtier'
    : 'Pulse de 2 s, commande MQTT';
  return (
    <section className="card narrow" aria-label="Commandes du boîtier" style={{ gap: 24 }}>
      <div className="col" style={{ gap: 4 }}>
        <h2>Actionneurs du boîtier</h2>
        <span className="card-note" style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>Chaque commande part en MQTT sur sentinel/groupe1/edge01/cmd et est journalisée en base.</span>
      </div>

      <div className="cmd">
        <div className="cmd-text"><strong>Buzzer <span className="pin">D8</span></strong><span>{buzzHint}</span></div>
        <button type="button" className="btn" onClick={s.buzz} disabled={act.buzzing}>
          {act.buzzing ? 'Le buzzer sonne…' : 'Faire sonner le buzzer (2 s)'}
        </button>
      </div>

      <LcdCommand s={s} />

      <div className="cmd">
        <div className="cmd-text" style={{ flex: '1 1 220px' }}>
          <strong>Buzzer sur détection</strong>
          <span>{act.auto
            ? 'Activé : le buzzer sonne quand le PIR détecte un mouvement (boîtier armé).'
            : 'Désactivé : alarme silencieuse, même en cas de détection. Seul le dashboard est prévenu.'}</span>
          <span>Les réactions plus fines (objet dangereux, hors horaires…) se règlent dans l’onglet Règles.</span>
        </div>
        <div className="seg" role="group" aria-label="Buzzer sur détection">
          <button type="button" aria-pressed={act.auto} onClick={() => { if (!act.auto) s.toggleAuto(); }}>Activé</button>
          <button type="button" aria-pressed={!act.auto} onClick={() => { if (act.auto) s.toggleAuto(); }}>Désactivé</button>
        </div>
      </div>
    </section>
  );
}
