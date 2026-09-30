"use client";
import type { GymOsMember, PaginatedResponse } from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
export default function AdminGymOsMembersPage() {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [gymId, setGymId] = useState("");
  const query = useQuery({
    queryKey: ["admin-members", search, status, gymId],
    queryFn: () =>
      api.request<PaginatedResponse<GymOsMember>>(
        `/admin/gym-os/members?page=1&pageSize=100&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}${gymId ? `&gymId=${gymId}` : ""}`,
      ),
  });
  return (
    <>
      <PageHeader
        eyebrow="GymOS oversight · read only"
        title="GymOS members"
        description="Cross-gym support visibility. Private notes and audit internals are excluded."
      />
      <section className="panel filter-row">
        <input
          placeholder="Search member, phone, email or code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          placeholder="Gym UUID"
          value={gymId}
          onChange={(e) => setGymId(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option>ACTIVE</option>
          <option>INACTIVE</option>
          <option>ARCHIVED</option>
        </select>
      </section>
      {query.isLoading ? (
        <PageState title="Loading members…" />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : !query.data?.data.length ? (
        <PageState title="No members found" />
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Gym</th>
                <th>Code</th>
                <th>Phone</th>
                <th>Branch</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/gym-os/members/${m.id}`}>
                      <b>
                        {m.firstName} {m.lastName}
                      </b>
                    </Link>
                    <br />
                    <small>{m.email || "No email"}</small>
                  </td>
                  <td>{m.gym?.name}</td>
                  <td>{m.memberCode}</td>
                  <td>{m.phone}</td>
                  <td>{m.primaryBranch?.name || "—"}</td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                  <td>{new Date(m.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
