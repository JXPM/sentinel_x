import { type ChartOptions } from "chart.js";

export const getTelemetryChartOptions = (
  unit: string,
  minY?: number,
  maxY?: number,
  stepSize?: number
): ChartOptions<"line"> => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 500,
    easing: "easeOutQuart",
  },
  interaction: {
    mode: "index",
    intersect: false,
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      enabled: true,
      backgroundColor: "#0A1322",
      titleColor: "#94A3B8",
      bodyColor: "#38BDF8",
      borderColor: "rgba(6, 182, 212, 0.4)",
      borderWidth: 1,
      padding: 10,
      titleFont: { family: "monospace", size: 11 },
      bodyFont: { family: "monospace", size: 12, weight: "bold" },
      callbacks: {
        label: (context) => ` ${context.parsed.y} ${unit}`,
      },
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(255, 255, 255, 0.05)" },
      ticks: {
        color: "#94A3B8",
        font: { family: "monospace", size: 11, weight: "bold" },
        maxTicksLimit: 8,
      },
      border: { display: false },
    },
    y: {
      min: minY,
      max: maxY,
      grid: { color: "rgba(255, 255, 255, 0.05)" },
      ticks: {
        color: "#94A3B8",
        font: { family: "monospace", size: 11, weight: "bold" },
        padding: 8,
        stepSize: stepSize, // <-- Force le pas régulier (5 en 5)
      },
      border: { display: false },
    },
  },
});