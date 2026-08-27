import { Link } from "react-router-dom";

import { Breadcrumb } from "../components/Breadcrumb.js";
import { PageHeader } from "../components/PageHeader.js";

export function NotFoundPage() {
  return (
    <>
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Page Not Found" }]} />
      <PageHeader title="Page Not Found" />
      <div className="notice notice--warning" role="alert">
        <p className="notice__title">The requested page does not exist</p>
        <p className="notice__body">
          Check the address, or return to the <Link to="/projects">Procurement Projects</Link> register.
        </p>
      </div>
    </>
  );
}
