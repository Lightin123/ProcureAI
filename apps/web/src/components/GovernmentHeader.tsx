import React from "react";
import { Link, NavLink } from "react-router-dom";
import { EmblemIcon } from "./GovernmentIcons.js";

const NAV_ITEMS = [
  { to: "/projects", label: "Procurement Projects" },
  { to: "/status", label: "System Status" },
];

export function GovernmentHeader() {

  return (
    <header role="banner">
      {/* 1. National Top Accessibility Bar */}
      <div className="gov-top-bar">
        <div className="portal-container gov-top-bar__inner">
          <div className="gov-top-bar__left">
            <div className="gov-top-bar__flag-strip" aria-label="Indian Tricolor Strip">
              <span></span>
              <span></span>
              <span></span>
            </div>
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
          <Link to="/projects" className="gov-main-header__brand" aria-label="ProcureAI Home">
            <div className="gov-main-header__emblem" aria-hidden="true">
              <EmblemIcon size={38} />
            </div>
            <div className="gov-main-header__titles">
              <div className="gov-main-header__gov-line">
                Ministry of Commerce & Industry · Government of India
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
          <div className="gov-main-header__user-box">
            <div className="gov-user-avatar" aria-hidden="true">
              GO
            </div>
            <div className="gov-user-meta">
              <span className="gov-user-meta__name">Government Officer</span>
              <span className="gov-user-meta__role">
                Procurement Division · Active Session
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Deep Blue National Navigation Bar */}
      <nav className="gov-navbar" aria-label="Primary Navigation">
        <div className="portal-container">
          <ul className="gov-navbar__list">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="gov-navbar__item">
                <NavLink
                  to={item.to}
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
