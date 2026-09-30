"use client";
import type { GymOsMembership, PaginatedResponse } from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
export default function AdminMembershipsPage() {
  const [gymId, setGymId] = useState(""),
    [status, setStatus] = useState("");
  const query = useQuery({
    queryKey: ["admin-memberships", gymId, status],
    queryFn: () =>
      api.request<PaginatedResponse<GymOsMembership>>(
        `/admin/gym-os/memberships?page=1&pageSize=100${gymId ? `&gymId=${gymId}` : ""}${status ? `&status=${status}` : ""}`,
      ),
  });
  return (
    <>
      <PageHeader
        eyebrow="GymOS oversight · read only"
        title="Memberships"
        description="Inspect membership lifecycle state and snapshots across subscribed gyms."
      />
      <section className="panel filter-row">
        <input
          placeholder="Gym UUID"
          value={gymId}
          onChange={(e) => setGymId(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["SCHEDULED", "ACTIVE", "FROZEN", "EXPIRED", "CANCELLED"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
      </section>
      {query.isLoading ? (
        <PageState title="Loading memberships…" />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : !query.data?.data.length ? (
        <PageState title="No memberships found" />
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Gym</th>
                <th>Plan</th>
                <th>Period</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.map((membership) => (
                <tr key={membership.id}>
                  <td>
                    <Link href={`/gym-os/memberships/${membership.id}`}>
                      {membership.member?.firstName}{" "}
                      {membership.member?.lastName}
                    </Link>
                    <br />
                    <small>{membership.member?.memberCode}</small>
                  </td>
                  <td>{membership.gym?.name}</td>
                  <td>{membership.planNameSnapshot}</td>
                  <td>
                    {new Date(membership.startDate).toLocaleDateString("en-IN")}{" "}
                    – {new Date(membership.endDate).toLocaleDateString("en-IN")}
                  </td>
                  <td>
                    <StatusBadge status={membership.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
