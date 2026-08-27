import React from "react";
import { SearchIcon, RefreshIcon } from "./GovernmentIcons.js";

export interface GovernmentFilterPanelProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedDepartment: string;
  onDepartmentChange: (department: string) => void;
  departments: string[];
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function GovernmentFilterPanel({
  searchQuery,
  onSearchChange,
  selectedDepartment,
  onDepartmentChange,
  departments,
  selectedStatus,
  onStatusChange,
  onRefresh,
  isRefreshing = false,
}: GovernmentFilterPanelProps) {
  return (
    <div className="gov-table-toolbar">
      <div className="gov-filter-group">
        <div className="gov-search-input-wrap">
          <span className="gov-search-icon">
            <SearchIcon size={16} />
          </span>
          <input
            type="text"
            className="gov-search-input"
            placeholder="Search by Reference, Title, Keyword..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search Procurement Projects"
          />
        </div>

        {departments.length > 0 && (
          <select
            className="gov-select"
            value={selectedDepartment}
            onChange={(e) => onDepartmentChange(e.target.value)}
            aria-label="Filter by Department"
          >
            <option value="ALL">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        )}

        <select
          className="gov-select"
          value={selectedStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          aria-label="Filter by Status"
        >
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="REQUIREMENTS_ANALYSIS">Requirements Analysis</option>
          <option value="REQUIREMENTS_CONFIRMED">Requirements Confirmed</option>
          <option value="TENDER_PREPARATION">Tender Preparation</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {onRefresh && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className="gov-btn gov-btn--tertiary gov-btn--sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh Project Records"
          >
            <RefreshIcon size={14} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      )}
    </div>
  );
}
