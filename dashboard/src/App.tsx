import React, { useState, useEffect, useRef, useMemo } from "react";

type TabKey = "supervision" | "capteurs" | "vision" | "alertes" | "commandes" | "systeme";
type ScenarioKey = "nominal" | "overheat" | "gas" | "intrusion";
type SeverityKey = "info" | "warning" | "critical";

interface Sample {
  temp: number;
  hum: number;
  gas: number;
  score: number;
  presence: boolean;
}

interface AlertItem {
  id: number;
  ts: string;
  source: string;
  type: string;
  severity: SeverityKey;
  message: string;
  dev: string;
  acked: boolean;
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabKey>("supervision");
  const [scenario, setScenario] = useState<ScenarioKey>("nominal");
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [tick, setTick] = useState<number>(120);
  const [since, setSince] = useState<number>(0);

  // Actionneurs matériels
  const [buzzing, setBuzzing] = useState<boolean>(false);
  const [ledGreen, setLedGreen] = useState<"auto" | "on" | "off">("auto");
  const [ledRed, setLedRed] = useState<"auto" | "on" | "off">("auto");
  const [autoResponse, setAutoResponse] = useState<boolean>(true);

  // Webcam
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  // Alertes
  const [alerts, setAlerts] = useState<AlertItem[]>([
    { id: 3, ts: "13:42:10", source: "vision", type: "Intrusion", severity: "warning", message: "Personne détectée (confiance 0,81)", dev: "cam-01", acked: true },
    { id: 2, ts: "11:05:47", source: "anomaly", type: "Fuite de gaz", severity: "warning", message: "Micro-déviation de gaz, revenue à la normale", dev: "sx-001", acked: true },
    { id: 1, ts: "08:15:02", source: "device", type: "Capteur hors ligne - critique", severity: "critical", message: "ESP hors ligne pendant 42 s", dev: "sx-001", acked: true }
  ]);
  const [nextId, setNextId] = useState<number>(4);
  const [fired, setFired] = useState<Record<string, boolean>>({});

  // 120 échantillons temporels glissants initialisés
  const [samples, setSamples] = useState<Sample[]>(() => {
    const list: Sample[] = [];
    for (let i = 0; i < 120; i++) {
      const w = Math.sin(i / 6);
      list.push({
        temp: 23.8 + 0.3 * w,
        hum: 55 - 0.5 * w,
        gas: 119 + 3 * w,
        score: 0.14 + 0.03 * w,
        presence: false
      });
    }
    return list;
  });

  // Horloge 24h
  const clock = useMemo(() => {
    const totalSecs = 15 * 3600 + 42 * 60 + 50 + (tick - 120) * 5;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(Math.floor(totalSecs / 3600) % 24)}:${p(Math.floor(totalSecs / 60) % 60)}:${p(totalSecs % 60)}`;
  }, [tick]);

  // Initialisation webcam matérielle (640x480)
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCameraActive(true);
      })
      .catch(() => setCameraActive(false));

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const triggerBuzzer = (auto = false) => {
    setBuzzing(true);
    setTimeout(() => setBuzzing(false), 2000);
    fetch("/api/v1/actuators/buzzer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true, auto })
    }).catch(() => {});
  };

  // Moteur cinétique temps réel cadencé à 1 seconde
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setTick((t) => t + 1);
      setSince((s) => s + 1);

      setSamples((prev) => {
        const k = since + 1;
        const currentTick = tick + 1;
        const p = Math.min(k / 30, 2.3);

        // Fluctuation sinusoïdale + bruit aléatoire pour ondulation visible continue
        const w = Math.sin(currentTick / 4);
        let temp = 23.8 + 0.4 * w + (Math.random() - 0.5) * 0.35;
        let hum = 55 - 0.8 * w + (Math.random() - 0.5) * 0.8;
        let gas = 119 + 5 * w + (Math.random() - 0.5) * 4.5;
        let score = 0.14 + 0.03 * Math.sin(currentTick / 3) + (Math.random() - 0.5) * 0.03;
        let presence = false;

        if (scenario === "overheat") {
          temp += 9 * p;
          hum -= 5 * Math.min(p, 1.6);
          gas += 8 * p;
          score += 0.52 * Math.min(p, 1.6);
        } else if (scenario === "gas") {
          gas += 140 * p;
          temp += 0.5 * p;
          score += 0.5 * Math.min(p, 1.6);
        } else if (scenario === "intrusion") {
          presence = true;
          score += 0.08;
        }

        const newSample: Sample = {
          temp: Math.min(45, Math.max(15, temp)),
          hum: Math.min(90, Math.max(20, hum)),
          gas: Math.max(40, Math.round(gas)),
          score: Math.max(0.02, Math.min(0.98, score)),
          presence
        };

        // Alertes automatiques
        const newFired = { ...fired };
        const addAlert = (key: string, alertData: Omit<AlertItem, "id" | "ts" | "acked">) => {
          if (newFired[key]) return;
          newFired[key] = true;
          setAlerts((curr) => [
            { id: nextId, ts: clock, acked: false, ...alertData },
            ...curr
          ].slice(0, 10));
          setNextId((id) => id + 1);
        };

        if (scenario === "overheat" && newSample.score >= 0.5) {
          addAlert("oh-w", { source: "anomaly", type: "Surchauffe lente", severity: "warning", dev: "sx-001", message: "Dérive thermique détectée" });
        }
        if (scenario === "overheat" && newSample.temp >= 40) {
          addAlert("oh-c", { source: "anomaly", type: "Surchauffe critique", severity: "critical", dev: "sx-001", message: "Température au-dessus de 40 °C" });
        }
        if (scenario === "gas" && newSample.score >= 0.5) {
          addAlert("gs-w", { source: "anomaly", type: "Fuite de gaz", severity: "warning", dev: "sx-001", message: "Micro-déviation de gaz détectée" });
        }
        if (scenario === "gas" && newSample.gas >= 400) {
          addAlert("gs-c", { source: "anomaly", type: "Fuite critique", severity: "critical", dev: "sx-001", message: "Indice de gaz au-dessus de 400" });
        }
        if (scenario === "intrusion") {
          addAlert("in-w", { source: "vision", type: "Intrusion", severity: "warning", dev: "cam-01", message: "Personne détectée (YOLO 0,87)" });
          if (k >= 2) {
            addAlert("in-c", { source: "fusion", type: "Intrusion confirmée", severity: "critical", dev: "sx-001", message: "PIR et caméra concordent" });
            if (autoResponse && !newFired["in-buzz"]) {
              newFired["in-buzz"] = true;
              triggerBuzzer(true);
            }
          }
        }
        setFired(newFired);

        return [...prev.slice(1), newSample];
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, tick, since, scenario, fired, nextId, clock, autoResponse]);

  const lastSample = samples[samples.length - 1];
  const agoSample = samples[samples.length - 61] || samples[0];

  // Régression linéaire cinétique
  const slope = (vals: number[]) => {
    const n = vals.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    vals.forEach((y, x) => { sx += x; sy += y; sxy += x * y; sxx += x * x; });
    return (n * sxy - sx * sy) / (n * sxx - sx * sx);
  };

  const recent24 = samples.slice(-24);
  const slopeTemp = slope(recent24.map((s) => s.temp));
  const slopeGas = slope(recent24.map((s) => s.gas));

  const forecast = useMemo(() => {
    const out: { kind: "temp" | "gas"; secs: number }[] = [];
    if (slopeTemp > 0.03 && lastSample.temp < 40) out.push({ kind: "temp", secs: ((40 - lastSample.temp) / slopeTemp) * 5 });
    if (slopeGas > 0.8 && lastSample.gas < 400) out.push({ kind: "gas", secs: ((400 - lastSample.gas) / slopeGas) * 5 });
    out.sort((a, b) => a.secs - b.secs);
    return { next: out[0] || null, both: out.length > 1 };
  }, [slopeTemp, slopeGas, lastSample]);

  const etaText = (secs: number) => (secs < 60 ? "moins d'1 min" : `~${Math.round(secs / 60)} min`);

  const level: "ok" | "warn" | "crit" = useMemo(() => {
    if (scenario === "intrusion") return since >= 2 ? "crit" : "warn";
    if (scenario === "overheat") return lastSample.temp >= 40 ? "crit" : lastSample.score >= 0.5 ? "warn" : "ok";
    if (scenario === "gas") return lastSample.gas >= 400 ? "crit" : lastSample.score >= 0.5 ? "warn" : "ok";
    return "ok";
  }, [scenario, since, lastSample]);

  const unackedCount = alerts.filter((a) => !a.acked).length;

  const ackAll = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, acked: true })));
  };

  const selectScenario = (key: ScenarioKey) => {
    setScenario(key);
    setSince(0);
    setFired({});
  };

  // Tracé SVG Sparkline avec échelle dynamique garantissant l'ondulation visible
  const generateSvgPath = (values: number[], width: number, height: number, fixedMin?: number, fixedMax?: number) => {
    const len = values.length;
    let min = fixedMin !== undefined ? fixedMin : Math.min(...values);
    let max = fixedMax !== undefined ? fixedMax : Math.max(...values);
    const diff = max - min;
    const padding = diff < 0.1 ? 0.5 : diff * 0.15;
    min -= padding;
    max += padding;

    return values.map((val, idx) => {
      const x = len > 1 ? (idx / (len - 1)) * width : 0;
      const clamped = Math.min(max, Math.max(min, val));
      const y = height - ((clamped - min) / (max - min || 1)) * height;
      return `${idx ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  };

  // Calculs dynamiques de l'Analyse IA
  const reached = lastSample.temp >= 40 || lastSample.gas >= 400;
  const aiColor = lastSample.score >= 0.5 ? (reached ? "#FF5C7A" : "#FFB547") : "#34D3A6";

  let aiType = "Normal";
  let aiProba = (0.9 - lastSample.score * 0.4).toFixed(2).replace(".", ",");
  if (lastSample.score >= 0.35) {
    if (forecast.both) {
      aiType = "Combiné";
      aiProba = (0.55 + lastSample.score * 0.4).toFixed(2).replace(".", ",");
    } else if (lastSample.gas >= 400 || (forecast.next && forecast.next.kind === "gas")) {
      aiType = "Fuite de gaz";
      aiProba = (0.55 + lastSample.score * 0.4).toFixed(2).replace(".", ",");
    } else if (lastSample.temp >= 40 || (forecast.next && forecast.next.kind === "temp")) {
      aiType = "Surchauffe";
      aiProba = (0.55 + lastSample.score * 0.4).toFixed(2).replace(".", ",");
    } else {
      aiType = "Indéterminé";
      aiProba = "0,50";
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0F18] text-[#ECEBFF] flex flex-col md:flex-row antialiased select-none font-sans">
      
      {/* SIDEBAR GAUCHE */}
      <nav
        aria-label="Navigation principale"
        className="w-full md:w-[240px] shrink-0 p-6 flex flex-col gap-6 border-b md:border-b-0 md:border-r border-[#1F1F2E] bg-[#12121C] self-stretch"
      >
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-lg bg-[#827AFF] text-[#171723] flex items-center justify-center font-mono font-bold text-sm">
            SX
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-base tracking-wide text-white font-mono">SENTINEL-X</span>
            <span className="text-xs text-[#8E8CAE]">AetherCorp</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {[
            { key: "supervision", label: "Vue d'ensemble", icon: "M3 3h7v9H3zm11 0h7v5h-7zm0 9h7v9h-7zM3 16h7v5H3z" },
            { key: "capteurs", label: "Capteurs", icon: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" },
            { key: "vision", label: "Vision IA", icon: "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5M2 6h14v12H2z" },
            { key: "alertes", label: "Alertes", icon: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" },
            { key: "commandes", label: "Commandes", icon: "M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04" },
            { key: "systeme", label: "Système", icon: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-.97c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }
          ].map((item) => {
            const active = currentTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setCurrentTab(item.key as TabKey)}
                className={`w-full min-h-[44px] flex items-center gap-3 px-3 rounded-xl text-sm font-medium transition text-left ${
                  active
                    ? "bg-[#1F1F2E] text-white font-semibold shadow-sm"
                    : "text-[#A9A7C9] hover:bg-[#1F1F2E]/60 hover:text-white"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#9C95FF" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon}></path>
                </svg>
                <span className="flex-1">{item.label}</span>
                {item.key === "alertes" && unackedCount > 0 && (
                  <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#FF5C7A] text-[#171723] font-mono text-xs font-bold flex items-center justify-center">
                    {unackedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-auto p-3.5 rounded-xl border border-dashed border-[#34344A] flex flex-col gap-1">
          <span className="font-mono text-xs text-[#9C95FF] font-semibold">DONNÉES SIMULÉES</span>
          <span className="text-xs text-[#A9A7C9]">Mock aligné sur l'API • 1 s affichée = 5 s simulées</span>
        </div>
      </nav>

      {/* CONTENU PRINCIPAL (IDENTIQUE À LA CAPTURE D'ÉCRAN) */}
      <main className="flex-1 min-w-0 p-6 md:p-8 flex flex-col gap-6 max-w-7xl">
        
        {/* En-tête */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Vue d'ensemble</h1>
            <span className="text-xs text-[#8E8CAE]">Boîtier sx-001 • micro-centrale de démonstration</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 font-mono text-xs text-[#A9A7C9]">
              <span className={`w-2 h-2 rounded-full ${isPlaying ? "bg-[#34D3A6] sx-live" : "bg-[#8E8CAE]"}`}></span>
              {isPlaying ? "En direct" : "En pause"} — {clock}
            </span>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="h-9 px-4 rounded-lg border border-[#34344A] bg-[#1F1F2E] text-xs font-medium text-[#ECEBFF] hover:bg-[#2A2A3D] transition"
            >
              {isPlaying ? "Mettre en pause" : "Reprendre"}
            </button>
          </div>
        </header>

        {/* Barre des scénarios de démo */}
        <section className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-[#171723] border border-[#2A2A3D]">
          <span className="font-mono text-[11px] text-[#8E8CAE] tracking-wider uppercase px-2 font-bold">
            SCÉNARIO DE DÉMO
          </span>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "nominal", label: "Nominal" },
              { id: "overheat", label: "Surchauffe lente" },
              { id: "gas", label: "Fuite de gaz" },
              { id: "intrusion", label: "Intrusion" }
            ].map((sc) => {
              const active = scenario === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => selectScenario(sc.id as ScenarioKey)}
                  className={`min-h-[36px] px-4 rounded-xl text-xs font-semibold transition border ${
                    active
                      ? "bg-[#827AFF] border-[#827AFF] text-[#171723]"
                      : "bg-[#1F1F2E] border-[#34344A] text-[#ECEBFF] hover:bg-[#2A2A3D]"
                  }`}
                >
                  {sc.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Bandeau d'état dynamique */}
        <div
          role="status"
          className={`flex flex-wrap items-center gap-4 p-5 rounded-2xl border transition ${
            level === "crit"
              ? "bg-[#FF5C7A]/10 border-[#FF5C7A]/50 sx-pulse"
              : level === "warn"
              ? "bg-[#FFB547]/10 border-[#FFB547]/45"
              : "bg-[#34D3A6]/10 border-[#34D3A6]/30"
          }`}
        >
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-black text-xl ${
              level === "crit"
                ? "bg-[#FF5C7A] text-[#171723]"
                : level === "warn"
                ? "bg-[#FFB547] text-[#171723]"
                : "bg-[#34D3A6] text-[#171723]"
            }`}
          >
            {level === "crit" ? "!" : level === "warn" ? "▲" : "✓"}
          </div>

          <div className="flex-1 min-w-[280px]">
            <span
              className={`font-mono text-xs tracking-widest uppercase font-bold block ${
                level === "crit" ? "text-[#FF5C7A]" : level === "warn" ? "text-[#FFB547]" : "text-[#34D3A6]"
              }`}
            >
              {level === "crit" ? "CRITIQUE" : level === "warn" ? "ATTENTION • PRÉVISION" : "NOMINAL"}
            </span>
            <div className="text-xl font-bold text-white mt-0.5">
              {scenario === "intrusion"
                ? (since >= 2 ? "Intrusion confirmée" : "Présence suspectée")
                : scenario === "overheat"
                ? (lastSample.temp >= 40 ? "Surchauffe : niveau critique atteint" : "Dérive thermique détectée")
                : scenario === "gas"
                ? (lastSample.gas >= 400 ? "Fuite de gaz : niveau critique" : "Micro-déviation de gaz détectée")
                : "Tout est nominal"}
            </div>
            <p className="text-xs text-[#A9A7C9] mt-0.5">
              4 capteurs en ligne • dernière mesure il y a 1 s • aucun incident prévu
            </p>
          </div>
        </div>

        {/* 4 Cartes statistiques : Courbes ondulantes à chaque seconde */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Température */}
          <div className="bg-[#171723] border border-[#2A2A3D] rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs text-[#A9A7C9]">
              <span>🌡 Température</span>
              <span className="px-2 py-0.5 rounded-full font-mono text-[11px] border text-[#A9A7C9] border-[#34344A]">
                {lastSample.temp >= 40 ? "critique" : "stable"}
              </span>
            </div>
            <div className="my-2 flex items-baseline">
              <span className="text-4xl font-mono font-bold text-white">{lastSample.temp.toFixed(1).replace(".", ",")}</span>
              <span className="text-sm font-mono text-[#A9A7C9] ml-1">°C</span>
            </div>
            {/* SVG ondulant continu */}
            <svg viewBox="0 0 200 40" className="w-full h-8 overflow-visible">
              <path
                d={generateSvgPath(samples.slice(-40).map((x) => x.temp), 200, 40)}
                fill="none"
                stroke="#FF9466"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs font-mono text-[#8E8CAE] mt-2">
              {lastSample.temp - agoSample.temp >= 0 ? "+" : ""}{(lastSample.temp - agoSample.temp).toFixed(1).replace(".", ",")} °C en 5 min
            </span>
          </div>

          {/* Humidité */}
          <div className="bg-[#171723] border border-[#2A2A3D] rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs text-[#A9A7C9]">
              <span>💧 Humidité</span>
              <span className="px-2 py-0.5 rounded-full font-mono text-[11px] border text-[#A9A7C9] border-[#34344A]">
                stable
              </span>
            </div>
            <div className="my-2 flex items-baseline">
              <span className="text-4xl font-mono font-bold text-white">{lastSample.hum.toFixed(0)}</span>
              <span className="text-sm font-mono text-[#A9A7C9] ml-1">%</span>
            </div>
            {/* SVG ondulant continu */}
            <svg viewBox="0 0 200 40" className="w-full h-8 overflow-visible">
              <path
                d={generateSvgPath(samples.slice(-40).map((x) => x.hum), 200, 40)}
                fill="none"
                stroke="#63C7FF"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs font-mono text-[#8E8CAE] mt-2">stable sur 5 min</span>
          </div>

          {/* Gaz */}
          <div className="bg-[#171723] border border-[#2A2A3D] rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs text-[#A9A7C9]">
              <span>♨ Gaz</span>
              <span className="px-2 py-0.5 rounded-full font-mono text-[11px] border text-[#A9A7C9] border-[#34344A]">
                stable
              </span>
            </div>
            <div className="my-2 flex items-baseline">
              <span className="text-4xl font-mono font-bold text-white">{lastSample.gas}</span>
              <span className="text-sm font-mono text-[#A9A7C9] ml-1">indice</span>
            </div>
            {/* SVG ondulant continu */}
            <svg viewBox="0 0 200 40" className="w-full h-8 overflow-visible">
              <path
                d={generateSvgPath(samples.slice(-40).map((x) => x.gas), 200, 40)}
                fill="none"
                stroke="#827AFF"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs font-mono text-[#8E8CAE] mt-2">stable sur 5 min</span>
          </div>

          {/* Présence PIR */}
          <div className="bg-[#171723] border border-[#2A2A3D] rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs text-[#A9A7C9]">
              <span>👁 Présence (PIR)</span>
              <span className="px-2 py-0.5 rounded-full font-mono text-[11px] border text-[#A9A7C9] border-[#34344A]">
                calme
              </span>
            </div>
            <div className="my-2">
              <span className={`text-4xl font-mono font-bold ${lastSample.presence ? "text-[#FF5C7A]" : "text-white"}`}>
                {lastSample.presence ? "Oui" : "Non"}
              </span>
            </div>
            <svg viewBox="0 0 200 40" className="w-full h-8 overflow-visible">
              <path
                d={generateSvgPath(samples.slice(-40).map((x) => (x.presence ? 1 : 0)), 200, 40, -0.2, 1.2)}
                fill="none"
                stroke="#ECEBFF"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs font-mono text-[#8E8CAE] mt-2">aucun mouvement depuis 10 min</span>
          </div>
        </section>

        {/* Section Milieu : Vision IA + Dernières alertes & Voyants */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Lecteur Vision IA */}
          <section className="lg:col-span-8 bg-[#171723] border border-[#2A2A3D] rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold font-mono text-white">Vision IA • cam-01</h2>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full border text-[#34D3A6] border-[#34D3A6]/40">
                BALAYAGE
              </span>
            </div>

            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-[#07070D] border border-[#23233A]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  cameraActive ? "opacity-100" : "opacity-0"
                }`}
              />

              <span className="sx-scan"></span>

              {/* Réticules coins */}
              <span className="absolute left-3 top-3 w-6 h-6 border-t-2 border-l-2 border-[#9C95FF]"></span>
              <span className="absolute right-3 top-3 w-6 h-6 border-t-2 border-r-2 border-[#9C95FF]"></span>
              <span className="absolute left-3 bottom-3 w-6 h-6 border-b-2 border-l-2 border-[#9C95FF]"></span>
              <span className="absolute right-3 bottom-3 w-6 h-6 border-b-2 border-r-2 border-[#9C95FF]"></span>

              {/* Réticule central */}
              <div className="absolute inset-0 flex items-center justify-center opacity-40">
                <div className="w-12 h-12 border border-[#9C95FF] rounded-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-[#9C95FF] rounded-full" />
                </div>
              </div>

              {/* Textes HUD */}
              <div className="absolute left-5 top-4 flex flex-col text-xs font-mono tracking-wider">
                <span className="text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#FF5C7A] sx-live"></span>
                  REC • CAM-01 • SX-001
                </span>
                <span className="text-[#8E8CAE] text-[11px]">FLUX MJPEG SIMULÉ • 640×480</span>
              </div>

              <div className="absolute right-5 top-4 flex flex-col items-end text-xs font-mono tracking-wider">
                <span className="text-white">T {clock}</span>
                <span className="text-[#8E8CAE] text-[11px]">IMG 0036297</span>
              </div>

              <div className="absolute left-5 bottom-4 flex flex-col text-xs font-mono">
                <span className="text-[#8E8CAE] text-[11px]">YOLOV8N • ONNX 320</span>
                <span className="text-white">INF 48 ms • 23 FPS</span>
              </div>

              <div className="absolute right-5 bottom-4 flex flex-col items-end text-xs font-mono">
                <span className="text-[#8E8CAE] text-[11px]">CONFIRMATION</span>
                <span className="text-[#34D3A6]">0/3 images</span>
              </div>

              {scenario === "intrusion" && (
                <div className="absolute left-[36%] top-[18%] w-[26%] h-[68%] border-2 border-[#FF5C7A] rounded bg-[#FF5C7A]/10 pointer-events-none flex flex-col justify-between p-1.5 animate-pulse">
                  <span className="bg-[#FF5C7A] text-[#171723] font-mono text-[10px] font-bold px-1.5 py-0.5 rounded w-max">
                    PERSONNE 0.87 • TRK-01
                  </span>
                </div>
              )}

              {scenario !== "intrusion" && (
                <div className="absolute left-1/2 bottom-12 transform -translate-x-1/2 text-xs font-mono tracking-widest text-[#8E8CAE]">
                  BALAYAGE • AUCUNE CIBLE
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 text-center pt-2">
              <div>
                <span className="text-xs text-[#8E8CAE] block">Inférence</span>
                <span className="font-mono text-base font-bold text-white">48 ms</span>
              </div>
              <div>
                <span className="text-xs text-[#8E8CAE] block">Débit</span>
                <span className="font-mono text-base font-bold text-white">23 FPS</span>
              </div>
              <div>
                <span className="text-xs text-[#8E8CAE] block">Confirmation</span>
                <span className="font-mono text-base font-bold text-white">0/3 images</span>
              </div>
            </div>
          </section>

          {/* Colonne droite */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <section className="bg-[#171723] border border-[#2A2A3D] rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex justify-between items-baseline">
                <h3 className="font-bold text-base text-white">Dernières alertes</h3>
                <span className="text-xs font-mono text-[#8E8CAE]">tout est acquitté</span>
              </div>

              <div className="space-y-3">
                {alerts.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    className="p-3.5 rounded-xl border border-[#2A2A3D] bg-[#1B1B29] flex items-center gap-3.5"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold ${
                        a.severity === "critical"
                          ? "bg-[#FF5C7A]/20 text-[#FF5C7A]"
                          : "bg-[#FFB547]/20 text-[#FFB547]"
                      }`}
                    >
                      {a.severity === "critical" ? "!" : "▲"}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0 leading-tight">
                      <strong className="text-sm font-semibold text-white">{a.type}</strong>
                      <span className="font-mono text-[11px] text-[#8E8CAE] mt-0.5">
                        {a.ts} • {a.source} • {a.dev}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setCurrentTab("alertes")}
                className="self-start text-xs font-semibold px-4 py-2 rounded-lg bg-[#1F1F2E] border border-[#34344A] text-[#ECEBFF] hover:bg-[#2A2A3D] transition"
              >
                Voir toutes les alertes
              </button>
            </section>

            <section className="bg-[#171723] border border-[#2A2A3D] rounded-2xl p-6 flex flex-col gap-4">
              <h3 className="font-bold text-base text-white">Voyants du boîtier</h3>

              <div className="space-y-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-[#34D3A6] shadow-[0_0_8px_#34D3A6]"></span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">LED verte</span>
                    <span className="text-[11px] text-[#8E8CAE]">Auto • allumée fixe : boîtier connecté au broker MQTTS</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-[#2A2A3D]"></span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">LED rouge</span>
                    <span className="text-[11px] text-[#8E8CAE]">Auto • éteinte : aucune alerte • clignote si le broker est perdu</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCurrentTab("commandes")}
                className="self-start text-xs font-semibold px-4 py-2 rounded-lg bg-[#1F1F2E] border border-[#34344A] text-[#ECEBFF] hover:bg-[#2A2A3D] transition"
              >
                Ouvrir les commandes
              </button>
            </section>
          </div>
        </div>

        {/* ================= ANALYSE IA PRÉDICTIVE DYNAMIQUE ================= */}
        <section aria-label="Analyse IA" className="bg-[#171723] border border-[#2A2A3D] rounded-2xl p-6 flex flex-col gap-5">
          <div className="flex justify-between items-baseline">
            <h2 className="text-xl font-bold font-mono text-white">Analyse IA</h2>
            <span className="text-xs font-mono text-[#8E8CAE]">prédictive</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* Score d'anomalie dynamique */}
            <div className="md:col-span-4 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xs font-medium text-[#A9A7C9]">Score d'anomalie</span>
                  <span className="text-3xl font-mono font-bold transition-colors" style={{ color: aiColor }}>
                    {lastSample.score.toFixed(2).replace(".", ",")}
                  </span>
                </div>
                {/* Jauge réactive animée */}
                <div role="meter" className="relative h-2.5 rounded-full bg-[#23233A] overflow-hidden mb-2">
                  <span
                    className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round(lastSample.score * 100)}%`,
                      backgroundColor: aiColor
                    }}
                  ></span>
                </div>
                <div className="flex justify-between font-mono text-[10px] text-[#8E8CAE]">
                  <span>0 normal</span>
                  <span>0,5 seuil appris</span>
                  <span>1 anormal</span>
                </div>
              </div>

              {/* Sparkline du score d'anomalie ondulant */}
              <div className="mt-3">
                <svg viewBox="0 0 200 40" className="w-full h-8 overflow-visible">
                  <path
                    d={generateSvgPath(samples.slice(-60).map((x) => x.score), 200, 40, 0, 1)}
                    fill="none"
                    stroke="#ECEBFF"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>

            {/* Prévision cinétique dynamique */}
            <div
              className={`md:col-span-5 p-5 rounded-2xl border flex flex-col justify-center transition-all ${
                reached
                  ? "bg-[#FF5C7A]/10 border-[#FF5C7A]/50"
                  : forecast.next
                  ? "bg-[#FFB547]/10 border-[#FFB547]/45"
                  : "bg-[#1B1B29] border-[#2A2A3D]"
              }`}
            >
              <span className="font-mono text-xs tracking-wider uppercase text-[#A9A7C9] block mb-1">
                PRÉVISION
              </span>
              <div className="text-2xl font-bold text-white mb-1">
                {reached
                  ? "Niveau critique atteint"
                  : forecast.next
                  ? `Incident dans ${etaText(forecast.next.secs)}`
                  : "Aucun incident prévu"}
              </div>
              <p className="text-xs text-[#A9A7C9]">
                {reached
                  ? "La valeur de référence est dépassée : agir maintenant."
                  : forecast.next
                  ? "Extrapolation de la tendance des 2 dernières minutes."
                  : "Les tendances des 2 dernières minutes sont stables."}
              </p>
            </div>

            {/* Diagnostics modèles dynamiques */}
            <div className="md:col-span-3 flex flex-col justify-between gap-3">
              <div>
                <span className="text-[11px] text-[#8E8CAE] block">Type d'incident</span>
                <strong className="text-sm font-semibold text-white block">{aiType}</strong>
                <span className="font-mono text-xs text-[#A9A7C9] block">
                  Random Forest • {aiProba}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[#8E8CAE] block">Détection</span>
                <strong className="text-sm font-semibold text-white block">
                  {lastSample.score >= 0.5 ? "Anomalie" : "Normal"}
                </strong>
                <span className="font-mono text-xs text-[#A9A7C9] block">
                  Isolation Forest
                </span>
              </div>
            </div>
          </div>

          <span className="text-xs text-[#8E8CAE] font-mono leading-relaxed">
            Aucune règle à seuil fixe : l'alerte vient du modèle entraîné sur les données normales. Les pointillés rouges ne sont qu'un repère pour la prévision.
          </span>
        </section>

      </main>
    </div>
  );
}