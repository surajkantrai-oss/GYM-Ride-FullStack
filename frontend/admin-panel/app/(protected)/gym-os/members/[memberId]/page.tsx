"use client";
import type { GymOsMember } from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
export default function AdminMemberDetail() {
  const { memberId } = useParams<{ memberId: string }>();
  const query = useQuery({
    queryKey: ["admin-member", memberId],
    queryFn: () =>
      api.request<GymOsMember>(`/admin/gym-os/members/${memberId}`),
  });
  if (query.isLoading) return <PageState title="Loading member…" />;
  if (query.error) return <ErrorState error={query.error} />;
  const m = query.data;
  if (!m) return null;
  return (
    <>
      <PageHeader
        eyebrow="Read-only GymOS member"
        title={`${m.firstName} ${m.lastName || ""}`}
        description={`${m.gym?.name || "Gym"} · ${m.memberCode}`}
        action={<StatusBadge status={m.status} />}
      />
      <section className="panel data-list">
        <div className="data-row">
          <span>Phone</span>
          <b>{m.phone}</b>
        </div>
        <div className="data-row">
          <span>Email</span>
          <b>{m.email || "Not provided"}</b>
        </div>
        <div className="data-row">
          <span>Primary branch</span>
          <b>{m.primaryBranch?.name || "Not assigned"}</b>
        </div>
        <div className="data-row">
          <span>Created</span>
          <b>{new Date(m.createdAt).toLocaleDateString("en-IN")}</b>
        </div>
      </section>
    </>
  );
}
