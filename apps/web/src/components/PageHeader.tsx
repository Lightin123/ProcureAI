import React, { type ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="gov-page-header">
      <div className="gov-page-header__left">
        <h1 className="gov-page-title">{title}</h1>
        {subtitle && <p className="gov-page-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="gov-page-header__actions">{action}</div>}
    </div>
  );
}
