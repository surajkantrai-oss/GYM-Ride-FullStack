"use client";
import type { DashboardSummary, GymStatus } from "@gymride/types";
import { ErrorState, PageHeader, PageState } from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
const labels: Array<[GymStatus, string]> = [
  ["APPROVED", "Live"],
  ["PENDING_APPROVAL", "In review"],
  ["DRAFT", "Drafts"],
  ["REJECTED", "Needs changes"],
];
export default function DashboardPage() {
  const query = useQuery({
    queryKey: ["partner-summary"],
    queryFn: () => api.request<DashboardSummary>("/partner/gyms/summary"),
  });
  if (query.isLoading) return <PageState title="Loading your workspace…" />;
  if (query.error || !query.data)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <>
      <PageHeader
        eyebrow="Partner overview"
        title="Your fitness network."
        description="Real-time status across your gyms and branches."
        action={
          <a className="button" href="/gyms/new">
            Create a gym
          </a>
        }
      />
      <section className="metric-grid">
        <article className="metric">
          <span className="metric-icon">◇</span>
          <strong>{query.data.totalGyms}</strong>
          <span>Total gyms</span>
        </article>
        <article className="metric">
          <span className="metric-icon">⌖</span>
          <strong>{query.data.totalBranches ?? 0}</strong>
          <span>Total branches</span>
        </article>
        {labels.map(([status, label]) => (
          <article className="metric" key={status}>
            <span className="metric-icon">
              {status === "APPROVED" ? "✓" : status === "DRAFT" ? "□" : "○"}
            </span>
            <strong>{query.data.statuses[status] ?? 0}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <div className="panel">
          <span className="eyebrow">Portfolio health</span>
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
          <h2>Next best step</h2>
          <p className="muted">
            Complete every branch’s operating hours before submitting a draft or
            rejected gym for review.
          </p>
          <a className="button" href="/gyms">
            Manage gyms
          </a>
        </section>
      </section>
    </>
  );
}
