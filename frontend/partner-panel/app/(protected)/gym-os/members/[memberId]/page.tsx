"use client";
import type {
  GymOsMember,
  GymOsAttendance,
  GymOsMembership,
  GymOsMembershipPlan,
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
import { FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
export default function MemberDetailPage() {
  const { user } = useAuth();
  const { memberId } = useParams<{ memberId: string }>(),
    params = useSearchParams(),
    cache = useQueryClient();
  const gyms = useQuery({
    queryKey: ["member-gyms"],
    queryFn: () =>
      api.request<PaginatedResponse<GymSummary>>(
        "/partner/gyms?page=1&limit=100",
      ),
  });
  const gymId = params.get("gymId") || gyms.data?.data[0]?.id || "";
  const member = useQuery({
    queryKey: ["member", gymId, memberId],
    enabled: !!gymId,
    queryFn: () =>
      api.request<GymOsMember>(
        `/partner/gyms/${gymId}/gym-os/members/${memberId}`,
      ),
  });
  const plans = useQuery({
    queryKey: ["membership-plans", gymId],
    enabled: !!gymId,
    queryFn: () =>
      api.request<GymOsMembershipPlan[]>(
        `/partner/gyms/${gymId}/gym-os/membership-plans`,
      ),
  });
  const memberships = useQuery({
    queryKey: ["member-memberships", gymId, memberId],
    enabled: !!gymId,
    queryFn: () =>
      api.request<GymOsMembership[]>(
        `/partner/gyms/${gymId}/gym-os/members/${memberId}/memberships`,
      ),
  });
  const attendance = useQuery({
    queryKey: ["member-attendance", gymId, memberId],
    enabled: !!gymId,
    queryFn: () =>
      api.request<PaginatedResponse<GymOsAttendance>>(
        `/partner/gyms/${gymId}/gym-os/members/${memberId}/attendance?page=1&pageSize=30`,
      ),
  });
  const finance = useQuery({
    queryKey: ["member-finance", gymId, memberId],
    enabled: !!gymId,
    queryFn: () => api.request<{totalFeeMinor:number;totalPaidMinor:number;outstandingMinor:number;charges:Array<{id:string;currency:string;dueDate:string;effectiveStatus:string}>;payments:Array<{id:string;amountMinor:number;currency:string;method:string;paidAt:string;status:string;receipt?:{receiptNumber:string}|null}>}>(`/partner/gyms/${gymId}/gym-os/members/${memberId}/finance`),
  });
  const preferences = useQuery({
    queryKey: ["member-communication-preferences", gymId, memberId], enabled: !!gymId,
    queryFn: () => api.request<{allowTransactional:boolean;allowMarketing:boolean;allowWhatsApp:boolean;allowSms:boolean;allowEmail:boolean}>(`/partner/gyms/${gymId}/gym-os/members/${memberId}/communication-preferences`),
  });
  const reminderHistory = useQuery({
    queryKey: ["member-reminders", gymId, memberId], enabled: !!gymId,
    queryFn: () => api.request<{items:Array<{id:string;type:string;channel:string;status:string;scheduledFor:string}>}>(`/partner/gyms/${gymId}/gym-os/reminders/deliveries?memberId=${memberId}&page=1&pageSize=20`),
  });
  const savePreferences = useMutation({
    mutationFn: (body:{allowTransactional:boolean;allowMarketing:boolean;allowWhatsApp:boolean;allowSms:boolean;allowEmail:boolean}) => api.request(`/partner/gyms/${gymId}/gym-os/members/${memberId}/communication-preferences`, {method:"PATCH",body:JSON.stringify(body)}),
    onSuccess: async () => {pushToast("Preferences saved","Future reminders will respect this member preference.");await cache.invalidateQueries({queryKey:["member-communication-preferences",gymId,memberId]});},
  });
  const update = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api.request(`/partner/gyms/${gymId}/gym-os/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      pushToast("Member updated", "Profile changes saved.");
      await cache.invalidateQueries({ queryKey: ["member", gymId, memberId] });
    },
  });
  const assign = useMutation({
    mutationFn: (body: { planId: string; startDate: string }) =>
      api.request(
        `/partner/gyms/${gymId}/gym-os/members/${memberId}/memberships`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: async () => {
      pushToast(
        "Membership assigned",
        "The plan snapshot and dates are saved.",
      );
      await cache.invalidateQueries({
        queryKey: ["member-memberships", gymId, memberId],
      });
    },
  });
  const lifecycle = useMutation({
    mutationFn: ({
      membership,
      action,
    }: {
      membership: GymOsMembership;
      action: string;
    }) => {
      const reason =
        action === "freeze" || action === "cancel"
          ? window.prompt(`Reason to ${action} membership`)
          : undefined;
      if ((action === "freeze" || action === "cancel") && !reason)
        throw new Error("A reason is required");
      const body =
        action === "renew"
          ? { planId: membership.membershipPlanId }
          : reason
            ? { reason }
            : {};
      return api.request(
        `/partner/gyms/${gymId}/gym-os/memberships/${membership.id}/${action}`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    onSuccess: async () => {
      pushToast(
        "Membership updated",
        "The lifecycle change is recorded in history.",
      );
      await cache.invalidateQueries({
        queryKey: ["member-memberships", gymId, memberId],
      });
    },
  });
  if (gyms.isLoading || member.isLoading)
    return <PageState title="Loading member…" />;
  if (member.error) return <ErrorState error={member.error} />;
  const m = member.data;
  if (!m) return null;
  const current = memberships.data?.find((membership) =>
    ["ACTIVE", "FROZEN", "SCHEDULED"].includes(membership.status),
  );
  const canWrite = !!user?.roles.some(
    (role) => role === "GYM_OWNER" || role === "GYM_MANAGER",
  );
  return (
    <>
      <PageHeader
        eyebrow={m.memberCode}
        title={`${m.firstName} ${m.lastName || ""}`}
        description="Direct GymOS member profile."
        action={<StatusBadge status={m.status} />}
      />
      <section className="panel">
        <form
          className="form-grid"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            update.mutate(
              Object.fromEntries(
                [...new FormData(e.currentTarget).entries()].filter(
                  ([, value]) => String(value).trim(),
                ),
              ) as Record<string, string>,
            );
          }}
        >
          {[
            ["firstName", "First name", m.firstName],
            ["lastName", "Last name", m.lastName || ""],
            ["phone", "Phone", m.phone],
            ["email", "Email", m.email || ""],
            ["notes", "Notes", m.notes || ""],
          ].map(([name, label, value]) => (
            <label className="field" key={name}>
              <span>{label}</span>
              <input name={name} defaultValue={value} />
            </label>
          ))}
          <div className="span-2">
            <button>Save member</button>
          </div>
        </form>
        <div className="data-list">
          <div className="data-row">
            <span>Primary branch</span>
            <b>{m.primaryBranch?.name || "Not assigned"}</b>
          </div>
          <div className="data-row">
            <span>Joined</span>
            <b>
              {m.joinedAt
                ? new Date(m.joinedAt).toLocaleDateString("en-IN")
                : "Not provided"}
            </b>
          </div>
          <div className="data-row">
            <span>Created</span>
            <b>{new Date(m.createdAt).toLocaleDateString("en-IN")}</b>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="data-row">
          <div>
            <small>Current membership</small>
            <h2>{current?.planNameSnapshot || "No open membership"}</h2>
          </div>
          {current && <StatusBadge status={current.status} />}
        </div>
        {current && (
          <>
            <div className="data-list">
              <div className="data-row">
                <span>Period</span>
                <b>
                  {new Date(current.startDate).toLocaleDateString("en-IN")} –{" "}
                  {new Date(current.endDate).toLocaleDateString("en-IN")}
                </b>
              </div>
              <div className="data-row">
                <span>Reference price</span>
                <b>
                  {current.currencySnapshot}{" "}
                  {(current.priceMinorSnapshot / 100).toFixed(2)}
                </b>
              </div>
              <div className="data-row">
                <span>Frozen time</span>
                <b>{current.totalFrozenDays} days</b>
              </div>
            </div>
            {canWrite && (
              <div className="button-row">
                {current.status === "ACTIVE" && (
                  <button
                    className="secondary"
                    onClick={() =>
                      lifecycle.mutate({
                        membership: current,
                        action: "freeze",
                      })
                    }
                  >
                    Freeze
                  </button>
                )}
                {current.status === "FROZEN" && (
                  <button
                    onClick={() =>
                      lifecycle.mutate({
                        membership: current,
                        action: "resume",
                      })
                    }
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={() =>
                    lifecycle.mutate({ membership: current, action: "renew" })
                  }
                >
                  Renew
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    lifecycle.mutate({ membership: current, action: "cancel" })
                  }
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <h2>Assign membership</h2>
        <form
          className="form-grid"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            assign.mutate({
              planId: String(values.get("planId")),
              startDate: String(values.get("startDate")),
            });
          }}
        >
          <label className="field">
            <span>Active plan</span>
            <select name="planId" required>
              {(plans.data || [])
                .filter((plan) => plan.status === "ACTIVE")
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Start date</span>
            <input name="startDate" type="date" required />
          </label>
          <div className="span-2">
            <button
              disabled={
                !canWrite ||
                assign.isPending ||
                !plans.data?.some((plan) => plan.status === "ACTIVE")
              }
            >
              Assign membership
            </button>
          </div>
        </form>
      </section>
      <section className="panel table-wrap">
        <h2>Membership history</h2>
        {!memberships.data?.length ? (
          <p>No memberships assigned.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Period</th>
                <th>Status</th>
                <th>Frozen</th>
              </tr>
            </thead>
            <tbody>
              {memberships.data.map((membership) => (
                <tr key={membership.id}>
                  <td>{membership.planNameSnapshot}</td>
                  <td>
                    {new Date(membership.startDate).toLocaleDateString("en-IN")}{" "}
                    – {new Date(membership.endDate).toLocaleDateString("en-IN")}
                  </td>
                  <td>
                    <StatusBadge status={membership.status} />
                  </td>
                  <td>{membership.totalFrozenDays} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="panel">
        <h2>Financial summary</h2>
        <div className="metric-grid"><article className="metric-card"><span>Membership fees</span><strong>₹{((finance.data?.totalFeeMinor??0)/100).toFixed(2)}</strong></article><article className="metric-card"><span>Paid</span><strong>₹{((finance.data?.totalPaidMinor??0)/100).toFixed(2)}</strong></article><article className="metric-card"><span>Outstanding</span><strong>₹{((finance.data?.outstandingMinor??0)/100).toFixed(2)}</strong></article></div>
        <a className="button" href={`/gym-os/payments`}>Record or view payments</a>
        {!!finance.data?.payments.length&&<div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th></tr></thead><tbody>{finance.data.payments.map(payment=><tr key={payment.id}><td>{payment.receipt?.receiptNumber??"—"}</td><td>{payment.currency} {(payment.amountMinor/100).toFixed(2)}</td><td>{payment.method}</td><td>{new Date(payment.paidAt).toLocaleString("en-IN")}</td><td><StatusBadge status={payment.status}/></td></tr>)}</tbody></table></div>}
      </section>
      <section className="panel table-wrap">
        <h2>Attendance history</h2>
        <p>
          {attendance.data?.data[0]
            ? `Last visit: ${new Date(attendance.data.data[0].checkInAt).toLocaleString("en-IN")}`
            : "No visits yet"}{" "}
          ·{" "}
          {attendance.data?.data.filter(
            (item) =>
              new Date(item.checkInAt).getTime() >= Date.now() - 30 * 86400000,
          ).length || 0}{" "}
          visits in the last 30 days ·{" "}
          {attendance.data?.data.some((item) => !item.checkOutAt)
            ? "Currently checked in"
            : "Not currently checked in"}
        </p>
        {attendance.data?.data.length ? (
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {attendance.data.data.map((item) => (
                <tr key={item.id}>
                  <td>{item.branch?.name}</td>
                  <td>{new Date(item.checkInAt).toLocaleString("en-IN")}</td>
                  <td>
                    {item.checkOutAt
                      ? new Date(item.checkOutAt).toLocaleString("en-IN")
                      : "Present"}
                  </td>
                  <td>{item.durationMinutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
      <section className="panel">
        <h2>Communication preferences</h2>
        <p>Transactional service reminders are separate from marketing consent.</p>
        {preferences.data && <form className="form-grid" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);savePreferences.mutate({allowTransactional:f.has("transactional"),allowMarketing:f.has("marketing"),allowWhatsApp:f.has("whatsapp"),allowSms:f.has("sms"),allowEmail:f.has("email")});}}>
          {[['transactional','Transactional reminders',preferences.data.allowTransactional],['marketing','Marketing',preferences.data.allowMarketing],['whatsapp','WhatsApp',preferences.data.allowWhatsApp],['sms','SMS',preferences.data.allowSms],['email','Email',preferences.data.allowEmail]].map(([name,label,checked])=><label className="field" key={String(name)}><span>{String(label)}</span><input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} disabled={!canWrite}/></label>)}
          <div className="span-2"><button disabled={!canWrite||savePreferences.isPending}>Save preferences</button></div>
        </form>}
      </section>
      <section className="panel table-wrap"><h2>Reminder history</h2><table><thead><tr><th>Type</th><th>Channel</th><th>Scheduled</th><th>Status</th></tr></thead><tbody>{reminderHistory.data?.items.map(item=><tr key={item.id}><td>{item.type.replaceAll("_"," ")}</td><td>{item.channel}</td><td>{new Date(item.scheduledFor).toLocaleString("en-IN")}</td><td><StatusBadge status={item.status}/></td></tr>)}</tbody></table></section>
    </>
  );
}
