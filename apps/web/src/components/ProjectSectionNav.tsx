import { NavLink } from "react-router-dom";

export function ProjectSectionNav({ projectId }: { projectId: string }) {
  const items = [
    { to: `/projects/${projectId}`, label: "Overview", end: true },
    { to: `/projects/${projectId}/requirements`, label: "Requirements", end: false },
  ];

  return (
    <nav className="section-nav" aria-label="Project sections">
      <ul className="section-nav__list">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `section-nav__link${isActive ? " section-nav__link--active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
