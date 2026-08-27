import React from "react";
import { NavLink } from "react-router-dom";
import { FileTextIcon, RobotIcon } from "./GovernmentIcons.js";

export function ProjectSectionNav({ projectId }: { projectId: string }) {
  const items = [
    {
      to: `/projects/${projectId}`,
      label: "Project Particulars",
      icon: <FileTextIcon size={16} />,
      end: true,
    },
    {
      to: `/projects/${projectId}/requirements`,
      label: "Requirements & AI Analysis",
      icon: <RobotIcon size={16} />,
      end: false,
    },
  ];

  return (
    <nav className="gov-tabs-nav" aria-label="Project Sections Navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `gov-tab-item${isActive ? " gov-tab-item--active" : ""}`
          }
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
