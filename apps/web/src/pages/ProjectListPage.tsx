import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { listProjects, type ProcurementProject } from "../api/projects.js";
import { useHasPermission } from "../auth/AuthContext.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { GovernmentFilterPanel } from "../components/GovernmentFilterPanel.js";
import { GovernmentPagination } from "../components/GovernmentPagination.js";
import { PlusIcon, FileTextIcon } from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";
import { ProjectStatusBadge } from "../components/ProjectStatusBadge.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; projects: ProcurementProject[] }
  | { kind: "failed"; message: string };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ProjectListPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pageSize = 10;

  const navigate = useNavigate();
  const hasPermission = useHasPermission();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const projects = await listProjects(signal);
      setState({ kind: "loaded", projects });
    } catch (error) {
      if (signal?.aborted === true) return;
      setState({
        kind: "failed",
        message: error instanceof Error ? error.message : "Projects could not be loaded.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    void load();
  };

  const allProjects = useMemo(() => {
    return state.kind === "loaded" ? state.projects : [];
  }, [state]);

  // Derive unique departments
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProjects) {
      if (p.organizationName) set.add(p.organizationName);
    }
    return Array.from(set).sort();
  }, [allProjects]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return allProjects.filter((p) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        query === "" ||
        p.referenceNumber.toLowerCase().includes(query) ||
        p.title.toLowerCase().includes(query) ||
        p.problemDescription.toLowerCase().includes(query) ||
        (p.organizationName && p.organizationName.toLowerCase().includes(query));

      const matchesDept =
        selectedDepartment === "ALL" || p.organizationName === selectedDepartment;

      const matchesStatus =
        selectedStatus === "ALL" || p.status === selectedStatus;

      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [allProjects, searchQuery, selectedDepartment, selectedStatus]);

  // Statistics
  const stats = useMemo(() => {
    const total = allProjects.length;
    const inAnalysis = allProjects.filter((p) => p.status === "REQUIREMENTS_ANALYSIS").length;
    const confirmed = allProjects.filter((p) => p.status === "REQUIREMENTS_CONFIRMED").length;
    const draft = allProjects.filter((p) => p.status === "DRAFT").length;
    return { total, inAnalysis, confirmed, draft };
  }, [allProjects]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredProjects.length / pageSize) || 1;
  const paginatedProjects = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, currentPage, pageSize]);

  return (
    <>
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Procurement Projects" }]} />

      <PageHeader
        title="Procurement Projects"
        subtitle="National Public Procurement Decision Support Register — Ministry of Commerce & Industry"
        action={
          hasPermission("project:create") ? (
            <button
              type="button"
              className="gov-btn gov-btn--primary gov-btn--lg"
              onClick={() => void navigate("/projects/new")}
            >
              <PlusIcon size={18} />
              Create Procurement Project
            </button>
          ) : undefined
        }
      />

      {/* Metrics Summary Grid */}
      <div className="gov-stats-grid">
        <div className="gov-stat-card">
          <span className="gov-stat-card__label">Total Projects</span>
          <span className="gov-stat-card__value">{stats.total}</span>
          <span className="gov-stat-card__meta">Recorded in Official Register</span>
        </div>
        <div className="gov-stat-card gov-stat-card--saffron">
          <span className="gov-stat-card__label">In AI Analysis</span>
          <span className="gov-stat-card__value">{stats.inAnalysis}</span>
          <span className="gov-stat-card__meta">Under Active Review</span>
        </div>
        <div className="gov-stat-card gov-stat-card--success">
          <span className="gov-stat-card__label">Requirements Confirmed</span>
          <span className="gov-stat-card__value">{stats.confirmed}</span>
          <span className="gov-stat-card__meta">Ready for Procurement</span>
        </div>
        <div className="gov-stat-card gov-stat-card--secondary">
          <span className="gov-stat-card__label">Draft Stage</span>
          <span className="gov-stat-card__value">{stats.draft}</span>
          <span className="gov-stat-card__meta">Pending Initiation</span>
        </div>
      </div>

      {state.kind === "failed" && (
        <GovernmentAlert type="error" title="Projects could not be loaded">
          {state.message}
        </GovernmentAlert>
      )}

      {/* Main Government Project Register */}
      <div className="gov-card" style={{ marginBottom: "32px" }}>
        <div className="gov-card__header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FileTextIcon size={20} />
            <h2 className="gov-card__title">Central Procurement Registry</h2>
          </div>
          <span className="gov-badge gov-badge--analysis">
            {filteredProjects.length} Records Found
          </span>
        </div>

        {/* Filters Toolbar */}
        <GovernmentFilterPanel
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            setCurrentPage(1);
          }}
          selectedDepartment={selectedDepartment}
          onDepartmentChange={(dept) => {
            setSelectedDepartment(dept);
            setCurrentPage(1);
          }}
          departments={departments}
          selectedStatus={selectedStatus}
          onStatusChange={(status) => {
            setSelectedStatus(status);
            setCurrentPage(1);
          }}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />

        {/* Registry Table */}
        <div className="gov-table-container">
          {state.kind === "loading" && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--gov-text-secondary)" }}>
              Loading procurement project records from central database…
            </div>
          )}

          {state.kind === "loaded" && filteredProjects.length === 0 && (
            <div style={{ padding: "48px 20px", textAlign: "center" }}>
              <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--gov-primary-dark)", margin: "0 0 6px" }}>
                No Matching Procurement Projects Found
              </p>
              <p style={{ color: "var(--gov-text-secondary)", margin: "0 0 16px", fontSize: "14px" }}>
                {searchQuery || selectedDepartment !== "ALL" || selectedStatus !== "ALL"
                  ? "Try resetting your search query or filters."
                  : hasPermission("project:create")
                    ? "No procurement projects have been recorded yet. Click 'Create Procurement Project' to initiate."
                    : "No procurement projects have been recorded for your department yet."}
              </p>
              {(searchQuery || selectedDepartment !== "ALL" || selectedStatus !== "ALL") && (
                <button
                  type="button"
                  className="gov-btn gov-btn--secondary gov-btn--sm"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedDepartment("ALL");
                    setSelectedStatus("ALL");
                    setCurrentPage(1);
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {state.kind === "loaded" && filteredProjects.length > 0 && (
            <table className="gov-table">
              <caption className="gov-table-caption">
                Showing official records for registered public procurement projects.
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "160px" }}>Reference Number</th>
                  <th scope="col">Procurement Project Title</th>
                  <th scope="col" style={{ width: "200px" }}>Department / Ministry</th>
                  <th scope="col" style={{ width: "190px" }}>Status</th>
                  <th scope="col" style={{ width: "140px" }}>Created On</th>
                  <th scope="col" style={{ width: "100px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProjects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <Link to={`/projects/${project.id}`} className="gov-table-mono">
                        {project.referenceNumber}
                      </Link>
                    </td>
                    <td>
                      <Link
                        to={`/projects/${project.id}`}
                        style={{ fontWeight: 600, color: "var(--gov-primary-dark)", display: "block" }}
                      >
                        {project.title}
                      </Link>
                      <span
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          fontSize: "12px",
                          color: "var(--gov-text-secondary)",
                          marginTop: "2px",
                        }}
                      >
                        {project.problemDescription}
                      </span>
                    </td>
                    <td style={{ color: "var(--gov-text-secondary)" }}>
                      {project.organizationName ?? "Central Procurement Cell"}
                    </td>
                    <td>
                      <ProjectStatusBadge status={project.status} />
                    </td>
                    <td style={{ color: "var(--gov-text-secondary)", fontSize: "13px" }}>
                      {formatDate(project.createdAt)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        to={`/projects/${project.id}`}
                        className="gov-btn gov-btn--secondary gov-btn--sm"
                      >
                        View Record
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <GovernmentPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredProjects.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
        />
      </div>
    </>
  );
}
