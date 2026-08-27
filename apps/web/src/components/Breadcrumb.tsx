import { GovernmentBreadcrumb, type BreadcrumbItem, type BreadcrumbProps } from "./GovernmentBreadcrumb.js";

export type { BreadcrumbItem, BreadcrumbProps };

export function Breadcrumb(props: BreadcrumbProps) {
  return <GovernmentBreadcrumb {...props} />;
}
