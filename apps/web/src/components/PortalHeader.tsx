import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/projects", label: "Procurement Projects" },
  { to: "/status", label: "System Status" },
];

export function PortalHeader() {
  return (
    <header className="portal-header">
      <div className="portal-header__bar">
        <div className="portal-header__identity">
          <span className="portal-header__emblem" aria-hidden="true">
            PA
          </span>
          <span className="portal-header__titles">
            <span className="portal-header__name">ProcureAI</span>
            <span className="portal-header__tagline">
              Public Procurement Decision Support Platform
            </span>
          </span>
        </div>
        <div className="portal-header__session">
          <span className="portal-header__session-label">Session</span>
          <span className="portal-header__session-value">Not signed in</span>
        </div>
      </div>

      <nav className="portal-nav" aria-label="Primary">
        <ul className="portal-nav__list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `portal-nav__link${isActive ? " portal-nav__link--active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
