import React, { useRef, useEffect, useState, memo } from "react";
import type{ VisionInference } from "../types/telemetry";

interface VideoFeedOverlayProps {
  inference: VisionInference;
}

export const VideoFeedOverlay = memo(function VideoFeedOverlay({
  inference,
}: VideoFeedOverlayProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        setCameraError(null);
        // Demande d'accès direct à la webcam en 640x480
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
      } catch (err) {
        console.error(err);
        setCameraError("Impossible d'accéder à la webcam. Vérifie qu'elle est branchée et autorisée par le navigateur.");
        setCameraActive(false);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-cyan-500/30 bg-[#070D18] shadow-2xl">
      {/* Flux vidéo réel */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          cameraActive ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Message si la caméra est débranchée ou non autorisée */}
      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-[#070D18]/90 z-20">
          <span className="text-rose-400 font-mono text-xs font-bold uppercase mb-1">
            CAMÉRA NON DÉTECTÉE
          </span>
          <span className="text-slate-400 font-mono text-xs">{cameraError}</span>
        </div>
      )}

      {/* Overlay HUD tactique */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {/* Repères d'angles */}
        <div className="absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-cyan-400/80" />
        <div className="absolute right-3 top-3 h-4 w-4 border-r-2 border-t-2 border-cyan-400/80" />
        <div className="absolute bottom-10 left-3 h-4 w-4 border-b-2 border-l-2 border-cyan-400/80" />
        <div className="absolute bottom-10 right-3 h-4 w-4 border-b-2 border-r-2 border-cyan-400/80" />

        {/* Bounding box simulée sur la personne filmée */}
        {inference.detectedCount > 0 && cameraActive && (
          <div className="absolute left-[32%] top-[22%] h-[56%] w-[36%] rounded border-2 border-rose-500 bg-rose-500/10">
            <div className="inline-flex items-center gap-1.5 rounded-br bg-rose-600 px-2 py-0.5 font-mono text-[10px] font-bold text-white shadow">
              <span className="uppercase">{inference.targetClass}</span>
              <span className="opacity-90">{(inference.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Bandeau bas */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-cyan-500/30 bg-[#0F1B30]/90 px-4 py-2 font-mono text-xs text-slate-300 backdrop-blur z-20">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-cyan-300 font-bold">WEBCAM ACTIVE • 640×480</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400 text-[11px]">
          <span>FPS : {inference.fps.toFixed(1)}</span>
          <span>
            CIBLES : <strong className="text-rose-400">{inference.detectedCount}</strong>
          </span>
        </div>
      </div>
    </div>
  );
});