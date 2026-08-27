import React from "react";
import { Outlet } from "react-router-dom";

import { PortalFooter } from "./PortalFooter.js";
import { PortalHeader } from "./PortalHeader.js";

export function PortalLayout() {
  return (
    <div className="portal-root">
      <PortalHeader />
      <main className="portal-main" id="main-content">
        <div className="portal-container">
          <Outlet />
        </div>
      </main>
      <PortalFooter />
    </div>
  );
}
