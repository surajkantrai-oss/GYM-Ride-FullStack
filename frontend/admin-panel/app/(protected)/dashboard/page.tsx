"use client";
import type { DashboardSummary, GymStatus } from "@gymride/types";
import { ErrorState, PageHeader, PageState } from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const labels: Array<[GymStatus, string]> = [
  ["PENDING_APPROVAL", "Awaiting review"],
  ["APPROVED", "Approved"],
  ["DRAFT", "Draft"],
  ["REJECTED", "Rejected"],
  ["SUSPENDED", "Suspended"],
];
export default function DashboardPage() {
  const query = useQuery({
    queryKey: ["admin-summary"],
    queryFn: () => api.request<DashboardSummary>("/admin/gyms/summary"),
  });
  if (query.isLoading) return <PageState title="Loading operations…" />;
  if (query.error || !query.data)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <>
      <PageHeader
        eyebrow="Operations overview"
        title="Good decisions, at a glance."
        description="Live totals from the GYMRide review pipeline."
        action={
          <a className="button" href="/gyms/pending">
            Review pending
          </a>
        }
      />
      <section className="metric-grid">
        <article className="metric">
          <span className="metric-icon">◇</span>
          <strong>{query.data.totalGyms}</strong>
          <span>Total gyms</span>
        </article>
        {labels.map(([status, label]) => (
          <article className="metric" key={status}>
            <span className="metric-icon">
              {status === "APPROVED"
                ? "✓"
                : status === "PENDING_APPROVAL"
                  ? "○"
                  : "□"}
            </span>
            <strong>{query.data.statuses[status] ?? 0}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <div className="panel">
          <span className="eyebrow">Platform health</span>
          <h2>Gym status</h2>
          <div className="status-bars">
            {labels.map(([status, label]) => (
              <div className="status-bar" key={status}>
                <span>{label}</span>
                <div>
                  <i
                    style={{
                      width: `${Math.max(8, ((query.data.statuses[status] ?? 0) / Math.max(query.data.totalGyms, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <strong>{query.data.statuses[status] ?? 0}</strong>
              </div>
            ))}
          </div>
        </div>
        <section className="panel action-panel">
          <h2>Review focus</h2>
          <p className="muted">
            Prioritize pending profiles, then keep an eye on suspended and
            rejected gyms that need follow-up.
          </p>
        </section>
      </section>
    </>
  );
}
