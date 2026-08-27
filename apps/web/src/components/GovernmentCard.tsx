import React from "react";

export interface GovernmentCardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  highlight?: boolean;
  className?: string;
  id?: string;
}

export function GovernmentCard({
  title,
  subtitle,
  action,
  children,
  footer,
  highlight = false,
  className = "",
  id,
}: GovernmentCardProps) {
  return (
    <section className={`gov-card ${className}`} id={id}>
      {(title || action) && (
        <div className={`gov-card__header ${highlight ? "gov-card__header--highlight" : ""}`}>
          <div>
            {title && <h2 className="gov-card__title">{title}</h2>}
            {subtitle && <div className="gov-card__subtitle">{subtitle}</div>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="gov-card__body">{children}</div>
      {footer && <div className="gov-card__footer">{footer}</div>}
    </section>
  );
}
