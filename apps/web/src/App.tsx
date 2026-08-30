import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/AuthContext.js";
import { ROUTE_PERMISSION, landingPathFor } from "./auth/routeAccess.js";
import { PortalLayout } from "./components/PortalLayout.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { RequirePermission } from "./components/RequirePermission.js";
import { AdminSupplierDetailPage } from "./pages/AdminSupplierDetailPage.js";
import { AdminSupplierRegistryPage } from "./pages/AdminSupplierRegistryPage.js";
import { EvaluationResponseDetailPage } from "./pages/EvaluationResponseDetailPage.js";
import { ForbiddenPage } from "./pages/ForbiddenPage.js";
import { GovernmentResponseDetailPage } from "./pages/GovernmentResponseDetailPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { ProjectCreatePage } from "./pages/ProjectCreatePage.js";
import { ProjectDetailPage } from "./pages/ProjectDetailPage.js";
import { ProjectListPage } from "./pages/ProjectListPage.js";
import { ProjectRequirementsPage } from "./pages/ProjectRequirementsPage.js";
import { ProjectWorkPackagesPage } from "./pages/ProjectWorkPackagesPage.js";
import { SystemStatusPage } from "./pages/SystemStatusPage.js";
import { VendorDashboardPage } from "./pages/VendorDashboardPage.js";
import { VendorInvitationDetailPage } from "./pages/VendorInvitationDetailPage.js";
import { VendorInvitationsPage } from "./pages/VendorInvitationsPage.js";
import { VendorOnboardingPage } from "./pages/VendorOnboardingPage.js";
import { VendorOpportunitiesPage } from "./pages/VendorOpportunitiesPage.js";
import { VendorOpportunityDetailPage } from "./pages/VendorOpportunityDetailPage.js";
import { VendorProfilePage } from "./pages/VendorProfilePage.js";
import { VendorRegisterPage } from "./pages/VendorRegisterPage.js";
import { VendorResponseEditorPage } from "./pages/VendorResponseEditorPage.js";
import { VendorResponsesPage } from "./pages/VendorResponsesPage.js";
import { WorkPackageEvaluationPage } from "./pages/WorkPackageEvaluationPage.js";
import { WorkPackageResponsesPage } from "./pages/WorkPackageResponsesPage.js";
import { WorkPackageVendorMatchingPage } from "./pages/WorkPackageVendorMatchingPage.js";

/** Sends each role to a section it is actually authorised to open. */
function LandingRedirect() {
  const { hasPermission } = useAuth();
  const landing = landingPathFor(hasPermission);

  // A role with no reachable section is explained rather than redirected,
  // which would otherwise loop back through this component.
  if (landing === undefined) {
    return <ForbiddenPage />;
  }

  return <Navigate to={landing} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<VendorRegisterPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<PortalLayout />}>
          <Route index element={<LandingRedirect />} />

          {/* Government procurement portal */}
          <Route element={<RequirePermission permission={ROUTE_PERMISSION.projects} />}>
            <Route path="projects" element={<ProjectListPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="projects/:id/requirements" element={<ProjectRequirementsPage />} />
            <Route path="projects/:id/work-packages" element={<ProjectWorkPackagesPage />} />
            <Route
              path="projects/:id/work-packages/:workPackageId/suppliers"
              element={<WorkPackageVendorMatchingPage />}
            />
            <Route
              path="projects/:id/work-packages/:workPackageId/responses"
              element={<WorkPackageResponsesPage />}
            />
            <Route
              path="projects/:id/work-packages/:workPackageId/responses/:responseId"
              element={<GovernmentResponseDetailPage />}
            />
            <Route
              path="projects/:id/work-packages/:workPackageId/evaluation"
              element={<WorkPackageEvaluationPage />}
            />
            <Route
              path="projects/:id/work-packages/:workPackageId/evaluation/responses/:responseId"
              element={<EvaluationResponseDetailPage />}
            />
          </Route>

          <Route element={<RequirePermission permission={ROUTE_PERMISSION.projectCreate} />}>
            <Route path="projects/new" element={<ProjectCreatePage />} />
          </Route>

          {/* Supplier portal */}
          <Route element={<RequirePermission permission={ROUTE_PERMISSION.vendor} />}>
            <Route path="vendor" element={<VendorDashboardPage />} />
            <Route path="vendor/onboarding" element={<VendorOnboardingPage />} />
            <Route path="vendor/profile" element={<VendorProfilePage />} />
          </Route>

          <Route element={<RequirePermission permission={ROUTE_PERMISSION.vendorOpportunities} />}>
            <Route path="vendor/opportunities" element={<VendorOpportunitiesPage />} />
            <Route path="vendor/opportunities/:id" element={<VendorOpportunityDetailPage />} />
          </Route>

          <Route element={<RequirePermission permission={ROUTE_PERMISSION.vendorInvitations} />}>
            <Route path="vendor/invitations" element={<VendorInvitationsPage />} />
            <Route path="vendor/invitations/:id" element={<VendorInvitationDetailPage />} />
          </Route>

          <Route element={<RequirePermission permission={ROUTE_PERMISSION.vendorResponses} />}>
            <Route path="vendor/responses" element={<VendorResponsesPage />} />
            <Route path="vendor/responses/:id" element={<VendorResponseEditorPage />} />
          </Route>

          {/* Portal administration */}
          <Route element={<RequirePermission permission={ROUTE_PERMISSION.vendorRegistry} />}>
            <Route path="admin/suppliers" element={<AdminSupplierRegistryPage />} />
            <Route path="admin/suppliers/:id" element={<AdminSupplierDetailPage />} />
          </Route>

          <Route element={<RequirePermission permission={ROUTE_PERMISSION.status} />}>
            <Route path="status" element={<SystemStatusPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
