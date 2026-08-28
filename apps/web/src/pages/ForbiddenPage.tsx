import React from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { PageHeader } from "../components/PageHeader.js";

export function ForbiddenPage() {
  const { user } = useAuth();

  return (
    <>
      <PageHeader
        title="Access Not Permitted"
        subtitle="Your role does not have the authorisation required for this section of the portal."
      />

      <GovernmentAlert type="warning" title="Authorisation Required" role="alert">
        This section is restricted. The request was refused by the portal, not merely hidden.
      </GovernmentAlert>

      <GovernmentCard title="Your Current Access">
        <dl className="gov-desc-list">
          <div className="gov-desc-item">
            <dt className="gov-desc-term">Signed In As</dt>
            <dd className="gov-desc-val">{user?.fullName ?? "Unknown"}</dd>
          </div>
          <div className="gov-desc-item">
            <dt className="gov-desc-term">Assigned Role</dt>
            <dd className="gov-desc-val">{user?.roleLabel ?? "Unknown"}</dd>
          </div>
          <div className="gov-desc-item">
            <dt className="gov-desc-term">Nodal Department</dt>
            <dd className="gov-desc-val">{user?.organizationName ?? "Unknown"}</dd>
          </div>
        </dl>
        <p>
          If you require access to this section, contact your department administrator. Roles and
          permissions are assigned centrally and cannot be changed from within the portal.
        </p>
        <Link className="gov-btn gov-btn--secondary" to="/">
          Return to your dashboard
        </Link>
      </GovernmentCard>
    </>
  );
}
