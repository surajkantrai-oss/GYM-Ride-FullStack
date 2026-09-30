"use client";
import type {
  GymOsReminderCampaign,
  GymOsReminderDelivery,
  GymOsReminderRule,
  GymSummary,
  PaginatedResponse,
} from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
  pushToast,
  useAuth,
} from "@gymride/web-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
export default function Reminders() {
  const { user } = useAuth(),
    write = !user?.roles.includes("GYM_STAFF"),
    cache = useQueryClient();
  const [selected, setSelected] = useState(""),
    [name, setName] = useState(""),
    [segment, setSegment] = useState("EXPIRING_IN_7_DAYS"),
    [scheduled, setScheduled] = useState("");
  const gyms = useQuery({
      queryKey: ["reminder-gyms"],
      queryFn: () =>
        api.request<PaginatedResponse<GymSummary>>(
          "/partner/gyms?page=1&limit=100",
        ),
    }),
    gym = selected || gyms.data?.data[0]?.id || "";
  const rules = useQuery({
      queryKey: ["reminder-rules", gym],
      enabled: !!gym,
      queryFn: () =>
        api.request<GymOsReminderRule[]>(
          `/partner/gyms/${gym}/gym-os/reminders/rules`,
        ),
    }),
    history = useQuery({
      queryKey: ["reminder-history", gym],
      enabled: !!gym,
      queryFn: () =>
        api.request<{ items: GymOsReminderDelivery[] }>(
          `/partner/gyms/${gym}/gym-os/reminders/deliveries?page=1&pageSize=50`,
        ),
    }),
    campaigns = useQuery({
      queryKey: ["reminder-campaigns", gym],
      enabled: !!gym,
      queryFn: () =>
        api.request<{ items: GymOsReminderCampaign[] }>(
          `/partner/gyms/${gym}/gym-os/reminders/campaigns?page=1&pageSize=50`,
        ),
    });
  const update = useMutation({
      mutationFn: (x: GymOsReminderRule) =>
        api.request(`/partner/gyms/${gym}/gym-os/reminders/rules/${x.id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: !x.enabled }),
        }),
      onSuccess: async () => {
        pushToast("Rule updated", "Future evaluations use the new setting.");
        await cache.invalidateQueries({ queryKey: ["reminder-rules"] });
      },
    }),
    payload = () => ({
      name,
      type:
        segment === "OVERDUE"
          ? "PAYMENT_OVERDUE"
          : segment.includes("VISIT")
            ? "INACTIVITY"
            : "MEMBERSHIP_EXPIRING",
      channel: "WHATSAPP",
      segment,
      scheduledFor: new Date(scheduled).toISOString(),
    }),
    preview = useMutation({
      mutationFn: () =>
        api.request<{
          eligible: number;
          optedOut: number;
          contactMissing: number;
        }>(`/partner/gyms/${gym}/gym-os/reminders/campaigns/preview`, {
          method: "POST",
          body: JSON.stringify(payload()),
        }),
    }),
    create = useMutation({
      mutationFn: () =>
        api.request(`/partner/gyms/${gym}/gym-os/reminders/campaigns`, {
          method: "POST",
          body: JSON.stringify(payload()),
        }),
      onSuccess: async () => {
        pushToast(
          "Campaign scheduled",
          "Targets will be re-evaluated at execution.",
        );
        await cache.invalidateQueries({ queryKey: ["reminder-campaigns"] });
      },
    }),
    cancel = useMutation({
      mutationFn: (id: string) =>
        api.request(
          `/partner/gyms/${gym}/gym-os/reminders/campaigns/${id}/cancel`,
          { method: "POST" },
        ),
      onSuccess: () =>
        cache.invalidateQueries({ queryKey: ["reminder-campaigns"] }),
    });
  return (
    <>
      <PageHeader
        eyebrow="GymOS · controlled communication"
        title="Reminders"
        description="Transactional, opt-in-aware reminders. Development delivery never sends externally."
      />
      <section className="panel filter-row">
        <select value={gym} onChange={(e) => setSelected(e.target.value)}>
          {gyms.data?.data.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </section>
      {rules.error ? (
        <ErrorState error={rules.error} />
      ) : rules.isLoading ? (
        <PageState title="Loading reminder rules…" />
      ) : (
        <section className="panel table-wrap">
          <h2>Automation rules</h2>
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Offset</th>
                <th>Channel</th>
                <th>Send / quiet hours</th>
                <th>Status</th>
                <th>Control</th>
              </tr>
            </thead>
            <tbody>
              {rules.data?.map((r) => (
                <tr key={r.id}>
                  <td>{r.type.replaceAll("_", " ")}</td>
                  <td>{r.offsetDays} days</td>
                  <td>{r.channel}</td>
                  <td>
                    {r.sendTime} · {r.quietStart}–{r.quietEnd}
                  </td>
                  <td>
                    <StatusBadge status={r.enabled ? "ENABLED" : "DISABLED"} />
                  </td>
                  <td>
                    <button
                      disabled={!write || update.isPending}
                      onClick={() => update.mutate(r)}
                    >
                      {r.enabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="panel">
        <h2>Schedule operational campaign</h2>
        <div className="filter-row">
          <input
            aria-label="Campaign name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Campaign name"
          />
          <select
            aria-label="Campaign segment"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
          >
            <option value="EXPIRING_IN_7_DAYS">Expiring in 7 days</option>
            <option value="OVERDUE">Overdue</option>
            <option value="NO_VISIT_14_DAYS">No visit · 14 days</option>
            <option value="NEW_MEMBER_NO_VISIT_7_DAYS">
              New member · no visit 7 days
            </option>
          </select>
          <input
            aria-label="Campaign schedule"
            type="datetime-local"
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
          />
          <button
            disabled={!write || !name || !scheduled}
            onClick={() => preview.mutate()}
          >
            Preview
          </button>
          <button
            disabled={!write || !name || !scheduled}
            onClick={() => create.mutate()}
          >
            Schedule
          </button>
        </div>
        {preview.data && (
          <p>
            {preview.data.eligible} eligible · {preview.data.optedOut} opted out
            · {preview.data.contactMissing} missing contact
          </p>
        )}
      </section>
      <section className="panel table-wrap">
        <h2>Campaigns</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Target</th>
              <th>Channel</th>
              <th>Scheduled</th>
              <th>Status</th>
              <th>Deliveries</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.data?.items.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.segment.replaceAll("_", " ")}</td>
                <td>{c.channel}</td>
                <td>{new Date(c.scheduledFor).toLocaleString("en-IN")}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
                    <td>
                      {c._count?.deliveries ?? 0}
                      <br />
                      <small>
                        {c.deliverySummary?.sent ?? 0} sent · {c.deliverySummary?.skipped ?? 0}{' '}
                        skipped · {c.deliverySummary?.failed ?? 0} failed
                      </small>
                    </td>
                <td>
                  {c.status === "SCHEDULED" && (
                    <button
                      disabled={!write}
                      onClick={() => cancel.mutate(c.id)}
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel table-wrap">
        <h2>Delivery history</h2>
        {history.error ? (
          <ErrorState error={history.error} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Reminder</th>
                <th>Channel</th>
                <th>Scheduled</th>
                <th>Status</th>
                <th>Attempts</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.items.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.member?.firstName} {d.member?.lastName}
                    <br />
                    <small>{d.member?.memberCode}</small>
                  </td>
                  <td>{d.type.replaceAll("_", " ")}</td>
                  <td>{d.channel}</td>
                  <td>{new Date(d.scheduledFor).toLocaleString("en-IN")}</td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td>
                    {d.attemptCount}
                    {d.lastErrorCode && <small> · {d.lastErrorCode}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
