import React from "react";

export type ProjectStatus =
  | "DRAFT"
  | "REQUIREMENTS_ANALYSIS"
  | "REQUIREMENTS_CONFIRMED"
  | "TENDER_PREPARATION"
  | "COMPLETED"
  | "CANCELLED"
  | string;

export interface GovernmentStatusBadgeProps {
  status: ProjectStatus;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: {
    label: "Draft",
    className: "gov-badge gov-badge--draft",
  },
  REQUIREMENTS_ANALYSIS: {
    label: "Requirements Analysis",
    className: "gov-badge gov-badge--analysis",
  },
  REQUIREMENTS_CONFIRMED: {
    label: "Requirements Confirmed",
    className: "gov-badge gov-badge--confirmed",
  },
  TENDER_PREPARATION: {
    label: "Tender Preparation",
    className: "gov-badge gov-badge--tender",
  },
  COMPLETED: {
    label: "Completed",
    className: "gov-badge gov-badge--completed",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "gov-badge gov-badge--cancelled",
  },
};

export function GovernmentStatusBadge({ status }: GovernmentStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "gov-badge gov-badge--draft",
  };

  return <span className={config.className}>{config.label}</span>;
}
