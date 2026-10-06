import React, { useState } from "react";
import Dashboard from "./dashboard";
import AlarmPanel from "./components/AlarmPanel";

type ActiveTab = "dashboard" | "alarms";

export default function App() {
  const [currentTab, setCurrentTab] = useState<ActiveTab>("dashboard");

  return (
    // FOND BLEU PÉTROLE PROFOND ET VIBRANT
    <div className="min-h-screen bg-[#0A1322] text-slate-100 font-sans flex flex-col selection:bg-cyan-500 selection:text-white">
      {/* BARRE DE NAVIGATION CONTRASTÉE */}
      <nav className="border-b border-cyan-500/25 bg-[#0F1B30]/90 backdrop-blur sticky top-0 z-50 shadow-lg shadow-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-300 font-mono font-black text-lg shadow-[0_0_15px_rgba(6,182,212,0.35)]">
              SX
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm tracking-wider uppercase text-white">
                  SENTINEL-X
                </span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400/70 block">
                AetherCorp Industrial Command • 2050
              </span>
            </div>
          </div>

          {/* Onglets tactiques */}
          <div className="flex items-center gap-2 bg-[#09101C] p-1.5 rounded-xl border border-cyan-900/50">
            <button
              onClick={() => setCurrentTab("dashboard")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all ${
                currentTab === "dashboard"
                  ? "bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <span>📊</span>
              <span>DASHBOARD</span>
            </button>

            <button
              onClick={() => setCurrentTab("alarms")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all ${
                currentTab === "alarms"
                  ? "bg-rose-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)]"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
              <span>ALARMES & ACTIONNEURS</span>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 font-mono text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-500/40 px-3 py-1.5 rounded-lg">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>MQTTS / TLS SÉCURISÉ</span>
          </div>

        </div>
      </nav>

      {/* CONTENU ACTIF */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {currentTab === "dashboard" ? <Dashboard /> : <AlarmPanel />}
      </main>

      <footer className="border-t border-cyan-950/60 py-3 px-6 text-center text-[10px] font-mono text-slate-500">
        EPSI WORKSHOP BAC+4 • CONSORTIUM GROUPE 14 • AETHERCORP DEFENSIVE UNIT
      </footer>
    </div>
  );
}