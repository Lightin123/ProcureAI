import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  fetchOpportunities,
  setOpportunitySaved,
  type VendorOpportunity,
} from "../api/vendor.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { SearchIcon } from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";
import { MatchBadge } from "../components/vendor/VendorStatusBadges.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; opportunities: VendorOpportunity[] }
  | { kind: "failed"; message: string };

type Filter = "ALL" | "STRONG" | "SAVED" | "INTEREST";

function formatDate(value: string | null): string {
  if (value === null) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function VendorOpportunitiesPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [department, setDepartment] = useState("ALL");
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  useEffect(() => {
    document.title = "Procurement Opportunities · ProcureAI";
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setState({ kind: "ready", opportunities: await fetchOpportunities(signal) });
    } catch (error) {
      if (signal?.aborted === true) return;
      setState({
        kind: "failed",
        message:
          error instanceof ApiRequestError
            ? error.message
            : "Published opportunities could not be loaded.",
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

  const opportunities = state.kind === "ready" ? state.opportunities : [];

  const departments = useMemo(
    () => [...new Set(opportunities.map((item) => item.departmentName))].sort(),
    [opportunities],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return opportunities.filter((opportunity) => {
      const matchesQuery =
        needle === "" ||
        opportunity.title.toLowerCase().includes(needle) ||
        opportunity.summary.toLowerCase().includes(needle) ||
        opportunity.referenceNumber.toLowerCase().includes(needle) ||
        opportunity.requirements.some((requirement) =>
          requirement.text.toLowerCase().includes(needle),
        );

      const matchesDepartment =
        department === "ALL" || opportunity.departmentName === department;

      const matchesFilter =
        filter === "ALL" ||
        (filter === "STRONG" && opportunity.match?.band === "STRONG") ||
        (filter === "SAVED" && opportunity.saved) ||
        (filter === "INTEREST" && opportunity.interestState === "SUBMITTED");

      return matchesQuery && matchesDepartment && matchesFilter;
    });
  }, [opportunities, query, department, filter]);

  async function toggleSaved(opportunity: VendorOpportunity) {
    setActionError(undefined);
    try {
      await setOpportunitySaved(opportunity.id, !opportunity.saved);
      await load();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError ? error.message : "The opportunity could not be saved.",
      );
    }
  }

  if (state.kind === "failed") {
    return (
      <>
        <PageHeader title="Procurement Opportunities" subtitle="Opportunities could not be loaded." />
        <GovernmentAlert type="error" title="Unable to Load Opportunities" role="alert">
          {state.message}
        </GovernmentAlert>
      </>
    );
  }

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Supplier Dashboard", to: "/vendor" },
          { label: "Procurement Opportunities" },
        ]}
      />

      <PageHeader
        title="Procurement Opportunities"
        subtitle="Requirements published by government departments, ranked against your recorded capabilities."
      />

      {actionError !== undefined && (
        <GovernmentAlert type="error" title="Action Failed" role="alert">
          {actionError}
        </GovernmentAlert>
      )}

      <GovernmentCard title="Search and Filter">
        <div className="gov-table-toolbar">
          <div className="gov-search-input-wrap">
            <span className="gov-search-icon" aria-hidden="true">
              <SearchIcon size={16} />
            </span>
            <input
              className="gov-search-input"
              type="search"
              placeholder="Search by title, reference or requirement text"
              aria-label="Search opportunities"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="gov-filter-group">
            <label className="gov-form-label" htmlFor="opportunity-department">
              Department
            </label>
            <select
              id="opportunity-department"
              className="gov-select"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            >
              <option value="ALL">All departments</option>
              {departments.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="gov-filter-group">
            <label className="gov-form-label" htmlFor="opportunity-filter">
              Show
            </label>
            <select
              id="opportunity-filter"
              className="gov-select"
              value={filter}
              onChange={(event) => setFilter(event.target.value as Filter)}
            >
              <option value="ALL">All published opportunities</option>
              <option value="STRONG">Strong capability match only</option>
              <option value="SAVED">Saved</option>
              <option value="INTEREST">Interest registered</option>
            </select>
          </div>
        </div>
      </GovernmentCard>

      <GovernmentCard
        title={`${filtered.length} Opportunit${filtered.length === 1 ? "y" : "ies"}`}
        subtitle="Ranked by capability match. The score narrows the list for you; it is not an eligibility determination."
      >
        {state.kind === "loading" ? (
          <p>Loading published opportunities…</p>
        ) : filtered.length === 0 ? (
          <p>
            {opportunities.length === 0
              ? "No procurement opportunities have been published yet. Departments publish a project once its requirements are confirmed."
              : "No opportunities match the current filters."}
          </p>
        ) : (
          <ul className="gov-opportunity-list">
            {filtered.map((opportunity) => (
              <li key={opportunity.id} className="gov-opportunity">
                <div className="gov-opportunity__head">
                  <div>
                    <Link
                      className="gov-opportunity__title"
                      to={`/vendor/opportunities/${opportunity.id}`}
                    >
                      {opportunity.title}
                    </Link>
                    <p className="gov-opportunity__meta">
                      {opportunity.referenceNumber} · {opportunity.departmentName} · Published{" "}
                      {formatDate(opportunity.publishedAt)}
                      {opportunity.responseDeadline !== null &&
                        ` · Responses by ${formatDate(opportunity.responseDeadline)}`}
                    </p>
                  </div>
                  {opportunity.match !== undefined && <MatchBadge match={opportunity.match} />}
                </div>

                <p className="gov-opportunity__summary">{opportunity.summary}</p>

                {opportunity.match !== undefined && opportunity.match.matchedTerms.length > 0 && (
                  <ul className="gov-chip-list">
                    {opportunity.match.matchedTerms.slice(0, 10).map((term) => (
                      <li key={term} className="gov-chip gov-chip--match">
                        {term}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="gov-opportunity__actions">
                  <Link
                    className="gov-btn gov-btn--secondary gov-btn--sm"
                    to={`/vendor/opportunities/${opportunity.id}`}
                  >
                    View requirements
                  </Link>
                  <button
                    type="button"
                    className="gov-btn gov-btn--tertiary gov-btn--sm"
                    onClick={() => void toggleSaved(opportunity)}
                  >
                    {opportunity.saved ? "Remove from saved" : "Save for later"}
                  </button>
                  {opportunity.interestState === "SUBMITTED" && (
                    <span className="gov-badge gov-badge--confirmed">Interest registered</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </GovernmentCard>
    </>
  );
}
