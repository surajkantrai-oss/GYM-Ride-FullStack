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
          <strong>{query.data.totalGyms}</strong>
          <span>Total gyms</span>
        </article>
        {labels.map(([status, label]) => (
          <article className="metric" key={status}>
            <strong>{query.data.statuses[status] ?? 0}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Review focus</h2>
        <p className="muted">
          Prioritize pending profiles, then keep an eye on suspended and
          rejected gyms that need follow-up.
        </p>
      </section>
    </>
  );
}
