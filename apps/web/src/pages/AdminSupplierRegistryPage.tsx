import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import { listVendorRegistry, type VendorRegistryEntry } from "../api/vendorRegistry.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { SearchIcon } from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";
import { VerificationBadge } from "../components/vendor/VendorStatusBadges.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; entries: VendorRegistryEntry[] }
  | { kind: "failed"; message: string };

export function AdminSupplierRegistryPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("PENDING");

  useEffect(() => {
    document.title = "Supplier Registry · ProcureAI";
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setState({ kind: "ready", entries: await listVendorRegistry(signal) });
    } catch (error) {
      if (signal?.aborted === true) return;
      setState({
        kind: "failed",
        message:
          error instanceof ApiRequestError
            ? error.message
            : "The supplier registry could not be loaded.",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  const entries = state.kind === "ready" ? state.entries : [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return entries.filter((entry) => {
      const matchesQuery =
        needle === "" ||
        entry.organizationName.toLowerCase().includes(needle) ||
        (entry.legalName ?? "").toLowerCase().includes(needle) ||
        (entry.headline ?? "").toLowerCase().includes(needle);

      const matchesFilter = filter === "ALL" || entry.verificationState === filter;

      return matchesQuery && matchesFilter;
    });
  }, [entries, query, filter]);

  const pendingCount = entries.filter((entry) => entry.verificationState === "PENDING").length;
  const verifiedCount = entries.filter((entry) => entry.verificationState === "VERIFIED").length;

  if (state.kind === "failed") {
    return (
      <>
        <PageHeader title="Supplier Registry" subtitle="The registry could not be loaded." />
        <GovernmentAlert type="error" title="Unable to Load Registry" role="alert">
          {state.message}
        </GovernmentAlert>
      </>
    );
  }

  return (
    <>
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Supplier Registry" }]} />

      <PageHeader
        title="Supplier Registry"
        subtitle="Registered suppliers across all sectors, and their verification status."
      />

      <GovernmentAlert type="info" title="Scope of This Register">
        Verification is a portal-administration duty and covers every registered supplier, not only
        those working with your department. The administrator role holds no procurement decision
        permission, so verifying a supplier here cannot lead to awarding them anything.
      </GovernmentAlert>

      <div className="gov-stats-grid">
        <div className="gov-stat-card">
          <span className="gov-stat-card__label">Registered Suppliers</span>
          <span className="gov-stat-card__value">{entries.length}</span>
        </div>
        <div className="gov-stat-card gov-stat-card--saffron">
          <span className="gov-stat-card__label">Awaiting Verification</span>
          <span className="gov-stat-card__value">{pendingCount}</span>
        </div>
        <div className="gov-stat-card gov-stat-card--success">
          <span className="gov-stat-card__label">Verified</span>
          <span className="gov-stat-card__value">{verifiedCount}</span>
        </div>
      </div>

      <GovernmentCard title="Search and Filter">
        <div className="gov-table-toolbar">
          <div className="gov-search-input-wrap">
            <span className="gov-search-icon" aria-hidden="true">
              <SearchIcon size={16} />
            </span>
            <input
              className="gov-search-input"
              type="search"
              placeholder="Search by organisation name"
              aria-label="Search suppliers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="gov-filter-group">
            <label className="gov-form-label" htmlFor="registry-filter">
              Verification status
            </label>
            <select
              id="registry-filter"
              className="gov-select"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="PENDING">Awaiting verification</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Changes requested</option>
              <option value="UNVERIFIED">Not yet submitted</option>
              <option value="ALL">All suppliers</option>
            </select>
          </div>
        </div>
      </GovernmentCard>

      <GovernmentCard title={`${filtered.length} Supplier${filtered.length === 1 ? "" : "s"}`}>
        {state.kind === "loading" ? (
          <p>Loading the supplier registry…</p>
        ) : filtered.length === 0 ? (
          <p>No suppliers match the current filters.</p>
        ) : (
          <div className="gov-table-container">
            <table className="gov-table">
              <thead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col">Sectors</th>
                  <th scope="col" style={{ width: "120px" }}>
                    Completion
                  </th>
                  <th scope="col" style={{ width: "110px" }}>
                    Documents
                  </th>
                  <th scope="col" style={{ width: "180px" }}>
                    Status
                  </th>
                  <th scope="col" style={{ width: "100px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.legalName ?? entry.organizationName}</strong>
                      {entry.headline !== null && (
                        <div className="gov-entry-card__meta">{entry.headline}</div>
                      )}
                    </td>
                    <td>
                      {entry.industries.length === 0 ? (
                        "—"
                      ) : (
                        <ul className="gov-chip-list">
                          {entry.industries.map((industry) => (
                            <li key={industry} className="gov-chip">
                              {industry.replace(/_/g, " ").toLowerCase()}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>{entry.completionPercentage}%</td>
                    <td>
                      {entry.documentCount}
                      {entry.pendingDocumentCount > 0 && (
                        <div className="gov-entry-card__meta">
                          {entry.pendingDocumentCount} to review
                        </div>
                      )}
                    </td>
                    <td>
                      <VerificationBadge state={entry.verificationState} />
                    </td>
                    <td>
                      <Link
                        className="gov-btn gov-btn--secondary gov-btn--sm"
                        to={`/admin/suppliers/${entry.id}`}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GovernmentCard>
    </>
  );
}
