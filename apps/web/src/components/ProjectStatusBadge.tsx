import { StatusBadge, type StatusTone } from "./StatusBadge.js";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  REQUIREMENTS_ANALYSIS: "Requirements Analysis",
  REQUIREMENTS_CONFIRMED: "Requirements Confirmed",
  WORK_PACKAGES_CONFIRMED: "Work Packages Confirmed",
  IN_DISCOVERY: "In Discovery",
  UNDER_EVALUATION: "Under Evaluation",
  AWAITING_DECISION: "Awaiting Decision",
  DECISION_RECORDED: "Decision Recorded",
  CANCELLED: "Cancelled",
};

const STATUS_TONES: Record<string, StatusTone> = {
  DRAFT: "inactive",
  REQUIREMENTS_ANALYSIS: "pending",
  REQUIREMENTS_CONFIRMED: "operational",
  WORK_PACKAGES_CONFIRMED: "operational",
  IN_DISCOVERY: "pending",
  UNDER_EVALUATION: "pending",
  AWAITING_DECISION: "pending",
  DECISION_RECORDED: "operational",
  CANCELLED: "unavailable",
};

export function ProjectStatusBadge({ status }: { status: string }) {
  return <StatusBadge tone={STATUS_TONES[status] ?? "inactive"} label={STATUS_LABELS[status] ?? status} />;
}
