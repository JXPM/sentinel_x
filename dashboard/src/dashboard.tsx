import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { MetricCard } from "./components/MetricCard";
import { VideoFeedOverlay } from "./components/VideoFeedOverlay";
import { getTelemetryChartOptions } from "./lib/chartTheme";
import type { SensorMetrics, NetworkHealth, VisionInference } from "./types/telemetry";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const BUFFER_LENGTH = 14;

export default function Dashboard() {
  const [network, setNetwork] = useState<NetworkHealth>({
    latencyMs: 28,
    protocol: "MQTTS",
    tlsVersion: "1.3",
    nodeIp: "192.168.10.45",
    packetLoss: 0,
  });

  const [metrics, setMetrics] = useState<SensorMetrics>({
    temperature: 24.2,
    humidity: 48.0,
    gasPpm: 130, // Nombre pair
    motionDetected: false,
    cpuTemperature: 45.2,
  });

  const [vision] = useState<VisionInference>({
    fps: 29.4,
    confidence: 0.96,
    detectedCount: 1,
    targetClass: "person",
  });

  const [timeline, setTimeline] = useState<string[]>(() =>
    Array.from({ length: BUFFER_LENGTH }, (_, i) => `${10 + i}:00`)
  );
  const [tempSeries, setTempSeries] = useState<number[]>(() =>
    Array(BUFFER_LENGTH).fill(24.0)
  );
  // Données de gaz initialisées avec des entiers pairs
  const [gasSeries, setGasSeries] = useState<number[]>(() =>
    Array(BUFFER_LENGTH).fill(130)
  );

  // Ingestion et mise à jour temps réel
  useEffect(() => {
    const streamTimer = setInterval(() => {
      const now = new Date().toLocaleTimeString("fr-FR", {
        hour12: false,
        minute: "2-digit",
        second: "2-digit",
      });

      setMetrics((prev) => {
        // Température bornée sous 40.0°C maximum
        const rawTemp = prev.temperature + (Math.random() * 0.4 - 0.2);
        const nextTemp = +Math.min(40.0, Math.max(18.0, rawTemp)).toFixed(1);

        // Concentration de gaz strictement PAIR
        const rawGas = Math.round(prev.gasPpm + (Math.random() * 6 - 3));
        const nextEvenGas = rawGas % 2 === 0 ? rawGas : rawGas + 1;

        setTempSeries((series) => [...series.slice(1), nextTemp]);
        setGasSeries((series) => [...series.slice(1), nextEvenGas]);
        setTimeline((labels) => [...labels.slice(1), now]);

        return {
          ...prev,
          temperature: nextTemp,
          gasPpm: nextEvenGas,
        };
      });

      setNetwork((prev) => ({
        ...prev,
        latencyMs: Math.floor(24 + Math.random() * 6),
      }));
    }, 2500);

    return () => clearInterval(streamTimer);
  }, []);

  const toggleMotionMock = useCallback(() => {
    setMetrics((prev) => ({ ...prev, motionDetected: !prev.motionDetected }));
  }, []);

  // Échelles : Max fixé à 40°C pour la température et 280 pour le gaz
  const tempOptions = useMemo(() => getTelemetryChartOptions("°C", 0, 40, 5), []);
  const gasOptions = useMemo(() => getTelemetryChartOptions("ppm", 80, 280), []);

  const tempChartData = useMemo(
    () => ({
      labels: timeline,
      datasets: [
        {
          label: "Température",
          data: tempSeries,
          borderColor: "#06b6d4",
          borderWidth: 3,
          backgroundColor: "rgba(6, 182, 212, 0.15)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: "#06b6d4",
          pointBorderColor: "#0A1322",
          pointBorderWidth: 2,
        },
      ],
    }),
    [timeline, tempSeries]
  );

  const gasChartData = useMemo(
    () => ({
      labels: timeline,
      datasets: [
        {
          label: "Concentration Gaz",
          data: gasSeries,
          borderColor: "#f59e0b",
          borderWidth: 3,
          backgroundColor: "rgba(245, 158, 11, 0.15)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: "#f59e0b",
          pointBorderColor: "#0A1322",
          pointBorderWidth: 2,
        },
      ],
    }),
    [timeline, gasSeries]
  );

  return (
    <div className="space-y-6">
      {/* 1. MÉTADONNÉES SYSTÈME ET RÉSEAU */}
      <section aria-label="Télémétrie Système" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Liaison Transport"
          value={network.protocol}
          badge={`TLS v${network.tlsVersion}`}
          status="success"
        >
          {/* IP masquée partiellement pour la sécurité tout en montrant le sous-réseau */}
          <div className="font-mono text-xs text-slate-400 font-medium">
            Node: 192.168.10.*** [SECURE]
          </div>
        </MetricCard>

        <MetricCard
          label="Latence Réseau"
          value={network.latencyMs}
          unit="ms"
          status={network.latencyMs < 40 ? "default" : "warning"}
        >
          <div className="font-mono text-xs text-slate-400 font-medium">Jitter: ±2ms • Wi-Fi G14</div>
        </MetricCard>

        <MetricCard
          label="Cadence IA Vision"
          value={vision.fps.toFixed(1)}
          unit="FPS"
          status="default"
        >
          <div className="font-mono text-xs text-slate-400 font-medium">YOLOv8-tiny • Webcam USB</div>
        </MetricCard>

        <MetricCard
          label="Température Hôte"
          value={metrics.cpuTemperature.toFixed(1)}
          unit="°C"
          status={metrics.cpuTemperature > 70 ? "danger" : "default"}
        >
          <div className="font-mono text-xs text-slate-400 font-medium">Enveloppe nominale</div>
        </MetricCard>
      </section>

      {/* 2. ZONE VIDÉO ET CAPTEUR PIR */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
              Flux Optique Principal • Détection YOLO
            </h2>
            <span className="font-mono text-xs text-cyan-400 font-semibold">640×480 @ 30 FPS</span>
          </div>
          <VideoFeedOverlay inference={vision} />
        </div>

        {/* Panneau latéral capteur PIR */}
        <div className="lg:col-span-4 flex flex-col justify-between rounded-xl border border-cyan-500/25 bg-[#132035] p-5 shadow-xl">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-xs font-bold uppercase text-slate-300 tracking-wider">
                Capteur PIR (HC-SR501)
              </span>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>

            <div className="mt-4">
              <span className="text-xs font-mono text-slate-400 uppercase">Statut volumétrique</span>
              <div className="text-xl font-mono font-black mt-1">
                {metrics.motionDetected ? (
                  <span className="text-rose-400 bg-rose-950/60 px-3 py-1 rounded-md border border-rose-600 inline-block animate-pulse">
                    INTRUSION DÉTECTÉE
                  </span>
                ) : (
                  <span className="text-slate-300 bg-slate-900/60 px-3 py-1 rounded-md border border-slate-700 inline-block">
                    PÉRIMÈTRE NOMINAL
                  </span>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs font-mono text-slate-400 leading-relaxed">
              Surveillance continue de la table d'ingénierie. Alerte réactive envoyée à l'ESP8266 et au serveur.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleMotionMock}
            className="mt-6 w-full rounded-lg border border-cyan-600/50 bg-cyan-950/60 hover:bg-cyan-900/80 py-2.5 font-mono text-xs font-bold text-cyan-300 transition active:scale-[0.98]"
          >
            SIMULER PASSAGE PIR
          </button>
        </div>
      </section>

      {/* 3. LES DEUX GRAPHIQUES : PLEINE LARGEUR, CÔTE À CÔTE */}
      <section aria-label="Séries temporelles environnementales" className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        {/* Graphique Température (DHT22) */}
        <div className="flex flex-col rounded-xl border border-cyan-500/25 bg-[#132035] p-5 shadow-xl w-full">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-300">
              Température Ambiante (DHT22)
            </span>
            <span className="font-mono text-xl font-black text-cyan-400">
              {metrics.temperature} °C
            </span>
          </div>
          <div className="h-64 w-full">
            <Line data={tempChartData} options={tempOptions} />
          </div>
        </div>

        {/* Graphique Gaz (MQ-2) */}
        <div className="flex flex-col rounded-xl border border-cyan-500/25 bg-[#132035] p-5 shadow-xl w-full">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
              Concentration Gaz Combustible (MQ-2)
            </span>
            <span className="font-mono text-xl font-black text-amber-400">
              {metrics.gasPpm} PPM
            </span>
          </div>
          <div className="h-64 w-full">
            <Line data={gasChartData} options={gasOptions} />
          </div>
        </div>
      </section>
    </div>
  );
}