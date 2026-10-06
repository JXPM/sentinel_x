export type SystemSecurityStatus = "nominal" | "warning" | "critical";

export interface SensorMetrics {
  temperature: number;
  humidity: number;
  gasPpm: number;
  motionDetected: boolean;
  cpuTemperature: number;
}

export interface NetworkHealth {
  latencyMs: number;
  protocol: "MQTTS" | "HTTPS";
  tlsVersion: string;
  nodeIp: string;
  packetLoss: number;
}

export interface VisionInference {
  fps: number;
  confidence: number;
  detectedCount: number;
  targetClass: string;
}