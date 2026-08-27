import { Outlet } from "react-router-dom";

import { PortalFooter } from "./PortalFooter.js";
import { PortalHeader } from "./PortalHeader.js";

export function PortalLayout() {
  return (
    <div className="portal">
      <PortalHeader />
      <main className="portal-main" id="main-content">
        <Outlet />
      </main>
      <PortalFooter />
    </div>
  );
}
