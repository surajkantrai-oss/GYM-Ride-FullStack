"use client";
import type { GymOsMembership } from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
export default function AdminMembershipDetailPage() {
  const { membershipId } = useParams<{ membershipId: string }>();
  const query = useQuery({
    queryKey: ["admin-membership", membershipId],
    queryFn: () =>
      api.request<GymOsMembership>(`/admin/gym-os/memberships/${membershipId}`),
  });
  if (query.isLoading) return <PageState title="Loading membership…" />;
  if (query.error) return <ErrorState error={query.error} />;
  const membership = query.data;
  if (!membership) return null;
  return (
    <>
      <PageHeader
        eyebrow="Read-only membership"
        title={membership.planNameSnapshot}
        description={`${membership.member?.firstName || "Member"} · ${membership.gym?.name || "Gym"}`}
        action={<StatusBadge status={membership.status} />}
      />
      <section className="panel data-list">
        <div className="data-row">
          <span>Plan snapshot</span>
          <b>{membership.planCodeSnapshot}</b>
        </div>
        <div className="data-row">
          <span>Period</span>
          <b>
            {new Date(membership.startDate).toLocaleDateString("en-IN")} –{" "}
            {new Date(membership.endDate).toLocaleDateString("en-IN")}
          </b>
        </div>
        <div className="data-row">
          <span>Branch scope</span>
          <b>
            {membership.branchIdsSnapshot.length
              ? `${membership.branchIdsSnapshot.length} branches`
              : "All branches"}
          </b>
        </div>
        <div className="data-row">
          <span>Frozen days</span>
          <b>{membership.totalFrozenDays}</b>
        </div>
      </section>
      <section className="panel">
        <h2>Lifecycle events</h2>
        <div className="data-list">
          {membership.events?.map((event) => (
            <div className="data-row" key={event.id}>
              <span>
                {event.type}
                <br />
                <small>{event.reason || "System lifecycle event"}</small>
              </span>
              <b>{new Date(event.occurredAt).toLocaleString("en-IN")}</b>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
