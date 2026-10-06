import React, { memo } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  badge?: string;
  status?: "default" | "warning" | "danger" | "success";
  children?: React.ReactNode;
}

const statusVariants = {
  default: "text-white",
  success: "text-emerald-400",
  warning: "text-amber-400",
  danger: "text-rose-400",
};

export const MetricCard = memo(function MetricCard({
  label,
  value,
  unit,
  badge,
  status = "default",
  children,
}: MetricCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-cyan-500/20 bg-[#132035] p-4 shadow-md transition hover:border-cyan-400/50">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
          {label}
        </span>
        {badge && (
          <span className="rounded bg-cyan-950/80 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300 border border-cyan-700/60">
            {badge}
          </span>
        )}
      </div>

      <div className="my-2 flex items-baseline gap-1.5">
        <span className={`font-mono text-2xl font-black tracking-tight ${statusVariants[status]}`}>
          {value}
        </span>
        {unit && <span className="font-mono text-xs font-bold text-slate-400">{unit}</span>}
      </div>

      {children && <div className="mt-1">{children}</div>}
    </div>
  );
});