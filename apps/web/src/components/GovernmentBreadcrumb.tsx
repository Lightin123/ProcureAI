import React from "react";
import { Link } from "react-router-dom";
import { ChevronRightIcon } from "./GovernmentIcons.js";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function GovernmentBreadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="gov-breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <React.Fragment key={index}>
            {index > 0 && (
              <span className="gov-breadcrumb__separator" aria-hidden="true">
                <ChevronRightIcon size={12} />
              </span>
            )}
            {isLast || item.to === undefined ? (
              <span className="gov-breadcrumb__current" aria-current={isLast ? "page" : undefined}>
                {item.label}
              </span>
            ) : (
              <Link to={item.to} className="gov-breadcrumb__link">
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
