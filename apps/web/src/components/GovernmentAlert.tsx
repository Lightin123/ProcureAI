import React from "react";
import { InfoIcon, CheckCircleIcon, AlertCircleIcon } from "./GovernmentIcons.js";

export type AlertType = "info" | "success" | "warning" | "danger" | "error";

export interface GovernmentAlertProps {
  type?: AlertType;
  title?: string;
  children: React.ReactNode;
  role?: "alert" | "status";
}

export function GovernmentAlert({
  type = "info",
  title,
  children,
  role = "status",
}: GovernmentAlertProps) {
  const normalizedType = type === "error" ? "danger" : type;

  const iconMap: Record<string, React.ReactNode> = {
    info: <InfoIcon size={20} />,
    success: <CheckCircleIcon size={20} />,
    warning: <AlertCircleIcon size={20} />,
    danger: <AlertCircleIcon size={20} />,
  };

  return (
    <div className={`gov-alert gov-alert--${normalizedType}`} role={role}>
      <div className="gov-alert__icon" aria-hidden="true">
        {iconMap[normalizedType]}
      </div>
      <div className="gov-alert__content">
        {title && <h3 className="gov-alert__title">{title}</h3>}
        <div className="gov-alert__body">{children}</div>
      </div>
    </div>
  );
}
