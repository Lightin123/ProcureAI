import { Navigate, Route, Routes } from "react-router-dom";

import { PortalLayout } from "./components/PortalLayout.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { ProjectCreatePage } from "./pages/ProjectCreatePage.js";
import { ProjectDetailPage } from "./pages/ProjectDetailPage.js";
import { ProjectListPage } from "./pages/ProjectListPage.js";
import { ProjectRequirementsPage } from "./pages/ProjectRequirementsPage.js";
import { ProjectWorkPackagesPage } from "./pages/ProjectWorkPackagesPage.js";
import { SystemStatusPage } from "./pages/SystemStatusPage.js";

export function App() {
  return (
    <Routes>
      <Route element={<PortalLayout />}>
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="projects" element={<ProjectListPage />} />
        <Route path="projects/new" element={<ProjectCreatePage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="projects/:id/requirements" element={<ProjectRequirementsPage />} />
        <Route path="projects/:id/work-packages" element={<ProjectWorkPackagesPage />} />
        <Route path="status" element={<SystemStatusPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
