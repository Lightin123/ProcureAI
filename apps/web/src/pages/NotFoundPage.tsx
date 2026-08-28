import React from "react";
import { Link } from "react-router-dom";

import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { PageHeader } from "../components/PageHeader.js";

export function NotFoundPage() {
  return (
    <>
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Page Not Found" }]} />
      <PageHeader
        title="404 — Page Not Found"
        subtitle="The requested government procurement record or resource could not be found."
      />
      <GovernmentAlert type="warning" title="Resource Unreachable">
        <p style={{ margin: "0 0 10px" }}>
          The requested URL does not match any official register entry. Please verify the URL or return to the central directory.
        </p>
        {/* "/" resolves to whichever portal this role belongs to, so a
            supplier is not sent to the government register. */}
        <Link to="/" className="gov-btn gov-btn--primary gov-btn--sm">
          Return to your dashboard
        </Link>
      </GovernmentAlert>
    </>
  );
}
