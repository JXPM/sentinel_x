import React, { useState, useEffect } from "react";

// Types stricts TypeScript
type AlertLevel = "NOMINAL" | "WARNING" | "CRITICAL";

interface SensorThresholds {
  tempMax: number;
  gasMax: number;
  pirTrigger: boolean;
}

interface AlarmEvent {
  id: string;
  time: string;
  type: "MANUAL" | "AI_PREDICTIVE" | "HARDWARE_SENSOR";
  description: string;
  severity: "INFO" | "WARN" | "CRIT";
}

export default function AlarmPanel() {
  // États des actionneurs physiques (reliés à l'ESP8266)
  const [buzzerActive, setBuzzerActive] = useState<boolean>(false);
  const [strobeLedActive, setStrobeLedActive] = useState<boolean>(false);
  const [lockdownActive, setLockdownActive] = useState<boolean>(false);

  // État global de l'alerte
  const [currentLevel, setCurrentLevel] = useState<AlertLevel>("NOMINAL");
  const [autoSirenArmed, setAutoSirenArmed] = useState<boolean>(true);

  // Seuils configurables
  const [thresholds, setThresholds] = useState<SensorThresholds>({
    tempMax: 45, // °C
    gasMax: 250, // PPM
    pirTrigger: true,
  });

  // Historique des déclenchements d'alarme
  const [events, setEvents] = useState<AlarmEvent[]>([
    {
      id: "EVT-101",
      time: "16:15:02",
      type: "HARDWARE_SENSOR",
      description: "Auto-test du buzzer piézoélectrique validé",
      severity: "INFO",
    },
    {
      id: "EVT-102",
      time: "16:21:40",
      type: "AI_PREDICTIVE",
      description: "Pic thermique cinétique détecté (Isolation Forest)",
      severity: "WARN",
    },
  ]);

  // Synchronisation du niveau d'alerte en fonction des actionneurs
  useEffect(() => {
    if (lockdownActive || buzzerActive) {
      setCurrentLevel("CRITICAL");
    } else if (strobeLedActive) {
      setCurrentLevel("WARNING");
    } else {
      setCurrentLevel("NOMINAL");
    }
  }, [buzzerActive, strobeLedActive, lockdownActive]);

  // Envoi des commandes physiques vers le Backend (Node.js / Python)
  const triggerActuator = async (
    target: "buzzer" | "led" | "lockdown" | "killswitch",
    state: boolean
  ) => {
    // 1. Mise à jour optimiste de l'UI
    if (target === "buzzer") setBuzzerActive(state);
    if (target === "led") setStrobeLedActive(state);
    if (target === "lockdown") {
      setLockdownActive(state);
      setBuzzerActive(state);
      setStrobeLedActive(state);
    }
    if (target === "killswitch") {
      setBuzzerActive(false);
      setStrobeLedActive(false);
      setLockdownActive(false);
      setCurrentLevel("NOMINAL");
    }

    // 2. Journalisation
    const newLog: AlarmEvent = {
      id: `EVT-${Date.now().toString().slice(-3)}`,
      time: new Date().toLocaleTimeString(),
      type: "MANUAL",
      description:
        target === "killswitch"
          ? "Arrêt d'urgence appliqué par l'opérateur"
          : `Commande ${target.toUpperCase()} passée à ${state ? "ACTIF" : "INACTIF"}`,
      severity: target === "killswitch" ? "INFO" : state ? "CRIT" : "WARN",
    };
    setEvents((prev) => [newLog, ...prev]);

    // 3. Appel API vers le PC Serveur Local (Route exigée dans le sujet)
    try {
      await fetch(`/api/v1/actuators/${target}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: state }),
      });
    } catch (err) {
      console.log("Mode déconnecté / local mock");
    }
  };

  return (
    <div
      className={`min-h-screen font-sans text-slate-100 p-4 sm:p-6 transition-colors duration-700 ${
        currentLevel === "CRITICAL"
          ? "bg-[#130707] shadow-[inset_0_0_120px_rgba(239,68,68,0.2)]"
          : "bg-[#07090E]"
      }`}
    >
      {/* ================= EN-TÊTE TACTIQUE ================= */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between pb-5 border-b border-cyan-500/20 gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="text-xs font-mono text-cyan-400 font-semibold tracking-widest uppercase">
              AETHERCORP DEFENSIVE PROTOCOL • 2050
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase mt-1">
            Système d'Alarme & Confinement Sentinel-X
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Module de contrôle des avertisseurs sonores, stroboscopiques et verrous de table
          </p>
        </div>

        {/* Badge d'État Global */}
        <div className="flex items-center gap-3">
          <div
            className={`px-5 py-2.5 rounded-xl border flex items-center gap-3 font-mono font-black text-sm tracking-wider uppercase shadow-xl ${
              currentLevel === "CRITICAL"
                ? "bg-red-950/80 border-red-500 text-red-400 shadow-red-900/40 animate-pulse"
                : currentLevel === "WARNING"
                ? "bg-amber-950/80 border-amber-500 text-amber-300"
                : "bg-emerald-950/80 border-emerald-500 text-emerald-400"
            }`}
          >
            <span
              className={`h-3.5 w-3.5 rounded-full ${
                currentLevel === "CRITICAL"
                  ? "bg-red-500 animate-ping"
                  : currentLevel === "WARNING"
                  ? "bg-amber-400"
                  : "bg-emerald-400"
              }`}
            ></span>
            <span>ÉTAT : {currentLevel}</span>
          </div>
        </div>
      </header>

      {/* ================= GRILLE PRINCIPALE ================= */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLONNE GAUCHE (7 Colonnes) : Actionneurs physiques & Arrêt d'Urgence */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          
          {/* BANDEAU D'ALERTE VISUELLE CRITIQUE */}
          {currentLevel === "CRITICAL" && (
            <div className="bg-red-600/10 border-2 border-red-600 rounded-xl p-4 flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-3">
                <span className="text-3xl">⚠️</span>
                <div>
                  <h3 className="text-sm font-bold text-red-400 font-mono uppercase tracking-wide">
                    ALERTE PHYSIQUE DÉCLENCHÉE
                  </h3>
                  <p className="text-xs text-red-300/80">
                    Les avertisseurs de l'avant-poste sont en cours d'émission active.
                  </p>
                </div>
              </div>
              <button
                onClick={() => triggerActuator("killswitch", false)}
                className="bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-black px-3 py-2 rounded-lg transition"
              >
                NEUTRALISER
              </button>
            </div>
          )}

          {/* COMMANDE DES ACTIONNEURS DIRECTS */}
          <div className="bg-[#0B0F19] border border-cyan-500/20 rounded-2xl p-5 shadow-2xl">
            <h2 className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase mb-4 pb-2 border-b border-slate-800 flex justify-between">
              <span>Actionneurs Raccordés (ESP8266 GPIO)</span>
              <span className="text-[11px] text-slate-500">MQTTS / TLS Sécurisé</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Carte Buzzer Piézo */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  buzzerActive
                    ? "bg-red-950/40 border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-mono text-slate-400">PIN D5 / GPIO14</span>
                    <h3 className="text-base font-bold text-white mt-0.5">Buzzer Piézoélectrique</h3>
                  </div>
                  <span
                    className={`h-3 w-3 rounded-full ${
                      buzzerActive ? "bg-red-500 animate-ping" : "bg-slate-700"
                    }`}
                  ></span>
                </div>
                <p className="text-xs text-slate-400 mb-4 min-h-[32px]">
                  Émission sonore cadencée de haute intensité sur le boîtier.
                </p>
                <button
                  onClick={() => triggerActuator("buzzer", !buzzerActive)}
                  className={`w-full py-2.5 rounded-xl font-mono text-xs font-bold uppercase transition ${
                    buzzerActive
                      ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                  }`}
                >
                  {buzzerActive ? "Couper Buzzer" : "Enclencher Buzzer"}
                </button>
              </div>

              {/* Carte LED Stroboscopique */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  strobeLedActive
                    ? "bg-amber-950/40 border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-mono text-slate-400">PIN D6 / GPIO12</span>
                    <h3 className="text-base font-bold text-white mt-0.5">LED Sentinelle</h3>
                  </div>
                  <span
                    className={`h-3 w-3 rounded-full ${
                      strobeLedActive ? "bg-amber-400 animate-ping" : "bg-slate-700"
                    }`}
                  ></span>
                </div>
                <p className="text-xs text-slate-400 mb-4 min-h-[32px]">
                  Signal lumineux physique de dissuasion industrielle.
                </p>
                <button
                  onClick={() => triggerActuator("led", !strobeLedActive)}
                  className={`w-full py-2.5 rounded-xl font-mono text-xs font-bold uppercase transition ${
                    strobeLedActive
                      ? "bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-500/30"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                  }`}
                >
                  {strobeLedActive ? "Éteindre LED" : "Allumer Flash LED"}
                </button>
              </div>
            </div>

            {/* BOUTON D'ARRÊT D'URGENCE / RESET (KILLSWITCH) */}
            <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-400 font-mono">
                Neutralise instantanément tous les signaux sonores et visuels en cours.
              </div>
              <button
                onClick={() => triggerActuator("killswitch", false)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-mono text-xs font-black uppercase tracking-widest shadow-xl shadow-red-900/40 border border-red-400/40 active:scale-95 transition"
              >
                🛑 Arrêt d'Urgence (Reset)
              </button>
            </div>
          </div>

          {/* VERROUILLAGE TOTAL (LOCKDOWN PROTOCOL) */}
          <div className="bg-[#0B0F19] border border-red-500/30 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-mono text-red-400 font-bold uppercase tracking-wider">
                  Mesure de Protection Critique
                </span>
                <h3 className="text-lg font-black text-white mt-1 uppercase">
                  Protocole de Confinement de Table (Lockdown)
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-lg">
                  Active simultanément le buzzer continu, le stroboscope LED et envoie une alerte prioritaire
                  vers l'écran OLED du boîtier.
                </p>
              </div>

              <button
                onClick={() => triggerActuator("lockdown", !lockdownActive)}
                className={`px-5 py-3 rounded-xl font-mono text-xs font-black tracking-widest uppercase transition-all shadow-xl ${
                  lockdownActive
                    ? "bg-red-600 text-white shadow-red-600/50 animate-bounce"
                    : "bg-red-950/60 border border-red-600/60 text-red-300 hover:bg-red-600 hover:text-white"
                }`}
              >
                {lockdownActive ? "CONFINEMENT ACTIF" : "ENCLENCHER LOCKDOWN"}
              </button>
            </div>
          </div>
        </section>

        {/* COLONNE DROITE (5 Colonnes) : Seuils de déclenchement & Journal d'événements */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          
          {/* SEUILS D'AUTOMATISATION */}
          <div className="bg-[#0B0F19] border border-cyan-500/20 rounded-2xl p-5 shadow-2xl">
            <h2 className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase mb-4 pb-2 border-b border-slate-800 flex justify-between items-center">
              <span>Seuils de Déclenchement Auto</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-[10px] text-slate-400 font-mono">Auto-Arm</span>
                <input
                  type="checkbox"
                  checked={autoSirenArmed}
                  onChange={(e) => setAutoSirenArmed(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </label>
            </h2>

            <div className="space-y-4">
              {/* Seuil Température */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Température Critique (DHT22)</span>
                  <span className="text-cyan-400 font-bold">{thresholds.tempMax} °C</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="70"
                  value={thresholds.tempMax}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, tempMax: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Seuil Gaz */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Seuil Gaz / Fumée (MQ-2)</span>
                  <span className="text-amber-400 font-bold">{thresholds.gasMax} PPM</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="600"
                  value={thresholds.gasMax}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, gasMax: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
              </div>

              {/* Déclencheur PIR */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <span className="text-xs font-mono text-slate-300">
                  Déclenchement sur Détection PIR (HC-SR501)
                </span>
                <button
                  onClick={() =>
                    setThresholds({ ...thresholds, pirTrigger: !thresholds.pirTrigger })
                  }
                  className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold ${
                    thresholds.pirTrigger
                      ? "bg-cyan-500/20 border border-cyan-400 text-cyan-300"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {thresholds.pirTrigger ? "ARMÉ" : "DÉSARMÉ"}
                </button>
              </div>
            </div>
          </div>

          {/* HISTORIQUE DES ALARMES / LOGS EN DIRECT */}
          <div className="bg-[#0B0F19] border border-cyan-500/20 rounded-2xl p-5 flex-1 flex flex-col min-h-[300px] shadow-2xl">
            <h2 className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase mb-3 pb-2 border-b border-slate-800 flex justify-between">
              <span>Journal des Incidents & Alertes</span>
              <span className="text-[10px] text-slate-500">Live Buffer</span>
            </h2>

            <div className="space-y-2.5 overflow-y-auto flex-1 max-h-[320px] pr-1">
              {events.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                    <span className="text-slate-400">{evt.time}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                        evt.severity === "CRIT"
                          ? "bg-red-950 text-red-400 border border-red-800/60"
                          : evt.severity === "WARN"
                          ? "bg-amber-950 text-amber-300 border border-amber-800/60"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {evt.severity}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-200">{evt.description}</div>
                  <div className="text-[10px] font-mono text-cyan-500/70 mt-1 uppercase">
                    Origine : {evt.type}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}