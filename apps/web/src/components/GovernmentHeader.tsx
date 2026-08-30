import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.js";
import { NAV_ITEMS, ROUTE_PERMISSION, landingPathFor } from "../auth/routeAccess.js";
import { EmblemIcon, IndiaFlagIcon } from "./GovernmentIcons.js";
import { NotificationBell } from "./NotificationBell.js";

function initialsOf(fullName: string): string {
  const parts = fullName.split(/\s+/).filter((part) => part !== "");
  const letters = parts.map((part) => part.charAt(0)).join("");
  return letters.slice(0, 2).toUpperCase() || "GO";
}

export function GovernmentHeader() {
  const { user, hasPermission, logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  // Filtering here is a usability measure. Every hidden destination is also
  // refused by the API, which is where access is actually decided. Because the
  // list is permission-driven, a government official is never shown supplier
  // navigation and a supplier is never shown the procurement register.
  const visibleNavItems = NAV_ITEMS.filter((item) => hasPermission(item.permission));

  const homePath = landingPathFor(hasPermission) ?? "/";

  async function handleSignOut() {
    setSigningOut(true);
    await logout();
    // state: null clears the location the route guard captured on the way out,
    // so the next person to sign in is not sent to this user's last page.
    await navigate("/login", { replace: true, state: null });
  }

  return (
    <header role="banner">
      {/* 1. National Top Accessibility Bar */}
      <div className="gov-top-bar">
        <div className="portal-container gov-top-bar__inner">
          <div className="gov-top-bar__left">
            <IndiaFlagIcon width={22} height={15} />
            <span className="gov-top-bar__title">
              भारत सरकार | Government of India
            </span>
          </div>
          <div className="gov-top-bar__right">
            <a href="#main-content" className="gov-skip-link">
              Skip to main content
            </a>
          </div>
        </div>
      </div>

      {/* 2. Main Institutional Identity Bar */}
      <div className="gov-main-header">
        <div className="portal-container gov-main-header__inner">
          <Link to={homePath} className="gov-main-header__brand" aria-label="ProcureAI Home">
            <div className="gov-main-header__emblem" aria-hidden="true">
              <EmblemIcon size={38} />
            </div>
            <div className="gov-main-header__titles">
              <div className="gov-main-header__gov-line">
                Ministry of Commerce &amp; Industry · Government of India
              </div>
              <div className="gov-main-header__portal-name">
                ProcureAI
                <span className="gov-main-header__portal-badge">Official Portal</span>
              </div>
              <div className="gov-main-header__tagline">
                Public Procurement Decision Support Platform
              </div>
            </div>
          </Link>

          {/* Session Area */}
          {user !== undefined && (
            <div className="gov-main-header__user-box">
              {/* Supplier accounts only. The endpoints behind it resolve the
                  supplier profile from the session, so this is a usability
                  control and not the place access is decided. */}
              {hasPermission(ROUTE_PERMISSION.vendor) && <NotificationBell />}

              <div className="gov-user-avatar" aria-hidden="true">
                {initialsOf(user.fullName)}
              </div>
              <div className="gov-user-meta">
                <span className="gov-user-meta__name">{user.fullName}</span>
                <span className="gov-user-meta__role">
                  {user.roleLabel} · {user.organizationName}
                </span>
              </div>
              <button
                type="button"
                className="gov-signout"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
              >
                {signingOut ? "Signing out…" : "Sign Out"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. Deep Blue National Navigation Bar */}
      <nav className="gov-navbar" aria-label="Primary Navigation">
        <div className="portal-container">
          <ul className="gov-navbar__list">
            {visibleNavItems.map((item) => (
              <li key={item.to} className="gov-navbar__item">
                <NavLink
                  to={item.to}
                  // A section with children below it stays highlighted while the
                  // user is inside them; a landing page without children does
                  // not steal the highlight from its own siblings.
                  end={item.matchPrefix === undefined}
                  className={({ isActive }) =>
                    `gov-navbar__link${isActive ? " gov-navbar__link--active" : ""}`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  );
}
