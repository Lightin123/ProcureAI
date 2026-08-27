import React from "react";

export type StatusTone = "operational" | "unavailable" | "pending" | "inactive";

export interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
}

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  const toneClasses: Record<StatusTone, string> = {
    operational: "gov-badge gov-badge--operational",
    unavailable: "gov-badge gov-badge--unavailable",
    pending: "gov-badge gov-badge--pending",
    inactive: "gov-badge gov-badge--inactive",
  };

  return <span className={toneClasses[tone] ?? "gov-badge"}>{label}</span>;
}
