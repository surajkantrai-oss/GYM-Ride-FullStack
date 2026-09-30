"use client";
import type { GymOsAttendance, PaginatedResponse } from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { adminAttendanceQuery } from "@/lib/gym-os";
export default function AdminAttendancePage() {
  const [gymId, setGymId] = useState(""),
    [branchId, setBranchId] = useState(""),
    [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["admin-attendance", gymId, branchId, search],
    queryFn: () =>
      api.request<PaginatedResponse<GymOsAttendance>>(
        adminAttendanceQuery({ gymId, branchId, search }),
      ),
  });
  return (
    <>
      <PageHeader
        eyebrow="GymOS oversight · read only"
        title="Attendance"
        description="Cross-gym direct-member attendance visibility without operational controls."
      />
      <section className="panel filter-row">
        <input
          placeholder="Gym UUID"
          value={gymId}
          onChange={(e) => setGymId(e.target.value)}
        />
        <input
          placeholder="Branch UUID"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
        />
        <input
          placeholder="Member name, code or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>
      {query.isLoading ? (
        <PageState title="Loading attendance…" />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : !query.data?.data.length ? (
        <PageState title="No attendance found" />
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Gym</th>
                <th>Branch</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Duration</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.member?.firstName} {a.member?.lastName}
                    <br />
                    <small>{a.member?.memberCode}</small>
                  </td>
                  <td>{a.gym?.name}</td>
                  <td>{a.branch?.name}</td>
                  <td>{new Date(a.checkInAt).toLocaleString("en-IN")}</td>
                  <td>
                    {a.checkOutAt
                      ? new Date(a.checkOutAt).toLocaleString("en-IN")
                      : "—"}
                  </td>
                  <td>{a.durationMinutes} min</td>
                  <td>{a.checkInMethod}</td>
                  <td>
                    <StatusBadge status={a.status} />
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
