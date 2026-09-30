"use client";
import type {
  GymBranch,
  GymOsAttendance,
  GymOsAttendanceSummary,
  GymOsMember,
  GymSummary,
  PaginatedResponse,
} from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
  pushToast,
} from "@gymride/web-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { attendanceDateFrom } from "@/lib/gym-os";
export default function AttendancePage() {
  const cache = useQueryClient(),
    [gymId, setGymId] = useState(""),
    [branchId, setBranchId] = useState(""),
    [search, setSearch] = useState(""),
    [historySearch, setHistorySearch] = useState(""),
    [method, setMethod] = useState(""),
    [range, setRange] = useState("TODAY"),
    [secondsLeft, setSecondsLeft] = useState(0),
    [qrImage, setQrImage] = useState("");
  const gyms = useQuery({
    queryKey: ["attendance-gyms"],
    queryFn: () =>
      api.request<PaginatedResponse<GymSummary>>(
        "/partner/gyms?page=1&limit=100",
      ),
  });
  const gym = gymId || gyms.data?.data[0]?.id || "";
  const branches = useQuery({
    queryKey: ["attendance-branches", gym],
    enabled: !!gym,
    queryFn: () => api.request<GymBranch[]>(`/partner/gyms/${gym}/branches`),
  });
  const branch = branchId || branches.data?.[0]?.id || "";
  const members = useQuery({
    queryKey: ["attendance-members", gym, search],
    enabled: !!gym,
    queryFn: () =>
      api.request<PaginatedResponse<GymOsMember>>(
        `/partner/gyms/${gym}/gym-os/members?page=1&pageSize=50&search=${encodeURIComponent(search)}&status=ACTIVE`,
      ),
  });
  const summary = useQuery({
    queryKey: ["attendance-summary", gym, branch],
    enabled: !!gym,
    queryFn: () =>
      api.request<GymOsAttendanceSummary>(
        `/partner/gyms/${gym}/gym-os/attendance/summary${branch ? `?branchId=${branch}` : ""}`,
      ),
  });
  const history = useQuery({
    queryKey: ["attendance-history", gym, branch, historySearch, method, range],
    enabled: !!gym,
    queryFn: () => {
      const from = attendanceDateFrom(
        range as "TODAY" | "7_DAYS" | "30_DAYS",
      );
      return (
      api.request<PaginatedResponse<GymOsAttendance>>(
          `/partner/gyms/${gym}/gym-os/attendance?page=1&pageSize=100&dateFrom=${from}${branch ? `&branchId=${branch}` : ""}${method ? `&method=${method}` : ""}${historySearch ? `&search=${encodeURIComponent(historySearch)}` : ""}`,
        )
      );
    },
  });
  const present = useQuery({
    queryKey: ["attendance-present", gym, branch],
    enabled: !!gym,
    queryFn: () =>
      api.request<PaginatedResponse<GymOsAttendance>>(
        `/partner/gyms/${gym}/gym-os/attendance/present${branch ? `?branchId=${branch}` : ""}`,
      ),
  });
  const refresh = async () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ["attendance-summary"] }),
      cache.invalidateQueries({ queryKey: ["attendance-history"] }),
      cache.invalidateQueries({ queryKey: ["attendance-present"] }),
    ]);
  const checkIn = useMutation({
    mutationFn: (memberId: string) =>
      api.request(`/partner/gyms/${gym}/gym-os/attendance/check-in`, {
        method: "POST",
        body: JSON.stringify({
          memberId,
          branchId: branch,
          reason: "Front desk check-in",
        }),
      }),
    onSuccess: async () => {
      pushToast("Checked in", "Attendance session opened.");
      await refresh();
    },
  });
  const checkOut = useMutation({
    mutationFn: (id: string) =>
      api.request(`/partner/gyms/${gym}/gym-os/attendance/${id}/check-out`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });
  const qr = useQuery({
    queryKey: ["attendance-qr", gym, branch],
    enabled: !!gym && !!branch,
    refetchInterval: 45_000,
    queryFn: () =>
      api.request<{ token: string; expiresAt: string }>(
        `/partner/gyms/${gym}/gym-os/attendance/branches/${branch}/qr`,
        { method: "POST" },
      ),
  });
  useEffect(() => {
    const value = qr.data;
    if (!value) return;
    let active = true;
    void import("qrcode").then(async (QRCode) => {
      const image = await QRCode.toDataURL(value.token, {
        width: 320,
        margin: 2,
        color: { dark: "#073c2d", light: "#fffdf7" },
      });
      if (active) setQrImage(image);
    });
    return () => {
      active = false;
    };
  }, [qr.data]);
  useEffect(() => {
    if (!qr.data) return;
    const update = () =>
      setSecondsLeft(
        Math.max(
          0,
          Math.ceil((new Date(qr.data.expiresAt).getTime() - Date.now()) / 1000),
        ),
      );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [qr.data]);
  const metrics = summary.data
    ? [
        ["Today", summary.data.todayCheckIns],
        ["Present", summary.data.currentlyPresent],
        ["Checked out", summary.data.checkOutsToday],
        ["Unique members", summary.data.uniqueMembersToday],
        ["Last 7 days", summary.data.last7DaysCount],
        ["Last 30 days", summary.data.last30DaysCount],
      ]
    : [];
  return (
    <>
      <PageHeader
        eyebrow="GymOS · branch operations"
        title="Attendance"
        description="Direct-member check-in, presence, history and secure rotating branch QR."
      />
      <section className="panel filter-row">
        <select value={gym} onChange={(e) => setGymId(e.target.value)}>
          {(gyms.data?.data || []).map((x) => (
            <option value={x.id} key={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select value={branch} onChange={(e) => setBranchId(e.target.value)}>
          {(branches.data || []).map((x) => (
            <option value={x.id} key={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </section>
      <section className="metric-grid">
        {metrics.map(([label, value]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <section className="card-grid">
        <article className="panel">
          <h2>Check in member</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, code or phone"
          />
          {(members.data?.data || []).slice(0, 8).map((m) => (
            <div className="data-row" key={m.id}>
              <span>
                <b>
                  {m.firstName} {m.lastName}
                </b>
                <br />
                <small>{m.memberCode}</small>
              </span>
              <button onClick={() => checkIn.mutate(m.id)}>Check in</button>
            </div>
          ))}
        </article>
        <article className="panel">
          <h2>Branch QR</h2>
          <p>
            {branches.data?.find((x) => x.id === branch)?.name} · refreshes
            automatically
          </p>
          {qrImage ? (
            <img
              src={qrImage}
              width="280"
              height="280"
              alt="Secure rotating attendance QR"
            />
          ) : (
            <PageState title="Generating secure QR…" />
          )}
          <p aria-live="polite">Expires in {secondsLeft} seconds</p>
          <small>Front-desk fallback: search by member code or phone.</small>
        </article>
      </section>
      <section className="panel table-wrap">
        <h2>Currently present</h2>
        {!present.data?.data.length ? (
          <PageState title="No members currently checked in" />
        ) : (
          <table>
            <thead><tr><th>Member</th><th>Branch</th><th>Check-in</th><th>Plan</th><th>Duration</th><th>Action</th></tr></thead>
            <tbody>{present.data.data.map((a) => <tr key={a.id}><td>{a.member?.firstName} {a.member?.lastName}<br/><small>{a.member?.memberCode}</small></td><td>{a.branch?.name}</td><td>{new Date(a.checkInAt).toLocaleString("en-IN")}</td><td>{a.membership?.planNameSnapshot}</td><td>{a.durationMinutes} min</td><td><button onClick={() => checkOut.mutate(a.id)}>Check out</button></td></tr>)}</tbody>
          </table>
        )}
      </section>
      {history.error ? (
        <ErrorState error={history.error} />
      ) : history.isLoading ? (
        <PageState title="Loading attendance…" />
      ) : (
        <section className="panel table-wrap">
          <h2>Attendance history</h2>
          <div className="filter-row">
            <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Name, phone or member code" />
            <select value={range} onChange={(e) => setRange(e.target.value)}><option value="TODAY">Today</option><option value="7_DAYS">7 days</option><option value="30_DAYS">30 days</option></select>
            <select value={method} onChange={(e) => setMethod(e.target.value)}><option value="">All methods</option><option value="MANUAL">Manual</option><option value="QR">QR</option></select>
          </div>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Branch</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Duration</th>
                <th>Method</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.data.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>
                      {a.member?.firstName} {a.member?.lastName}
                    </b>
                    <br />
                    <small>{a.member?.memberCode}</small>
                  </td>
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
                  <td>
                    {!a.checkOutAt && (
                      <button onClick={() => checkOut.mutate(a.id)}>
                        Check out
                      </button>
                    )}
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
