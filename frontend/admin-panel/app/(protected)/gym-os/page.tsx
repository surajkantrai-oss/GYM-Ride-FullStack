"use client";
import type {
  GymOsFeature,
  GymOsPlan,
  GymOsSubscription,
} from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
  pushToast,
} from "@gymride/web-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n / 100);
const features: GymOsFeature[] = [
  "MEMBERS",
  "MEMBERSHIP_MANAGEMENT",
  "ATTENDANCE",
  "RENEWALS",
  "DUES",
  "REPORTS",
  "STAFF",
  "REMINDERS",
  "CRM",
  "MULTI_BRANCH",
];
export default function AdminGymOsPage() {
  const cache = useQueryClient();
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    priceMinor: "",
    trialDays: "0",
    memberLimit: "",
    branchLimit: "",
  });
  const summary = useQuery({
    queryKey: ["admin-gymos-summary"],
    queryFn: () =>
      api.request<{ total: number; statuses: Record<string, number> }>(
        "/admin/gym-os/summary",
      ),
  });
  const plans = useQuery({
    queryKey: ["admin-gymos-plans"],
    queryFn: () => api.request<GymOsPlan[]>("/admin/gym-os/plans"),
  });
  const subscriptions = useQuery({
    queryKey: ["admin-gymos-subscriptions"],
    queryFn: () =>
      api.request<GymOsSubscription[]>("/admin/gym-os/subscriptions"),
  });
  const create = useMutation({
    mutationFn: () =>
      api.request("/admin/gym-os/plans", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          description: form.description,
          billingInterval: "MONTHLY",
          priceMinor: Number(form.priceMinor),
          currency: "INR",
          trialDays: Number(form.trialDays),
          memberLimit: Number(form.memberLimit),
          branchLimit: Number(form.branchLimit),
          features,
          displayOrder: 100,
        }),
      }),
    onSuccess: async () => {
      pushToast(
        "GymOS plan created",
        "Activate it when commercial configuration is ready.",
      );
      await cache.invalidateQueries({ queryKey: ["admin-gymos-plans"] });
    },
  });
  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      api.request(`/admin/gym-os/plans/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: value }),
      }),
    onSuccess: async () =>
      cache.invalidateQueries({ queryKey: ["admin-gymos-plans"] }),
  });
  const suspend = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.request(`/admin/gym-os/subscriptions/${id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: async () =>
      cache.invalidateQueries({ queryKey: ["admin-gymos-subscriptions"] }),
  });
  const activateSubscription = useMutation({
    mutationFn: (id: string) =>
      api.request(`/admin/gym-os/subscriptions/${id}/activate`, {
        method: "POST",
      }),
    onSuccess: async () => {
      pushToast("GymOS activated", "The gym can now use entitled GymOS modules.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["admin-gymos-subscriptions"] }),
        cache.invalidateQueries({ queryKey: ["admin-gymos-summary"] }),
      ]);
    },
    onError: (error) =>
      pushToast(
        "Activation failed",
        error instanceof Error ? error.message : "Check payment status.",
      ),
  });
  return (
    <>
      <PageHeader
        eyebrow="SaaS platform control"
        title="GymOS"
        description="Manage commercial plans, gym-scoped subscriptions and entitlement access."
      />
      {summary.isLoading ? (
        <PageState title="Loading GymOS summary…" />
      ) : summary.error ? (
        <ErrorState error={summary.error} />
      ) : (
        <section className="metric-grid">
          <article className="metric">
            <strong>{summary.data?.total || 0}</strong>
            <span>Total subscriptions</span>
          </article>
          {[
            "ACTIVE",
            "TRIALING",
            "PENDING_PAYMENT",
            "EXPIRED",
            "CANCELLED",
          ].map((s) => (
            <article className="metric" key={s}>
              <strong>{summary.data?.statuses[s] || 0}</strong>
              <span>{s.replaceAll("_", " ")}</span>
            </article>
          ))}
        </section>
      )}
      <section className="panel">
        <h2>Commercial plans</h2>
        {plans.isLoading ? (
          <PageState title="Loading plans…" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Price</th>
                  <th>Limits</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Requested</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {plans.data?.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.name}</b>
                      <br />
                      <small>{p.code}</small>
                    </td>
                    <td>{money(p.priceMinor)}/month</td>
                    <td>
                      {p.memberLimit} members · {p.branchLimit} branches
                    </td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td>
                      {p.status !== "ACTIVE" ? (
                        <button
                          onClick={() =>
                            status.mutate({ id: p.id, value: "ACTIVE" })
                          }
                        >
                          Activate
                        </button>
                      ) : (
                        <button
                          className="button-secondary"
                          onClick={() =>
                            status.mutate({ id: p.id, value: "INACTIVE" })
                          }
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Create plan</h2>
        <form
          className="form-grid"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          {Object.keys(form).map((k) => (
            <label className="field" key={k}>
              <span>{k}</span>
              <input
                value={form[k as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          ))}
          <div className="span-2">
            <button disabled={create.isPending}>Create draft plan</button>
          </div>
        </form>
      </section>
      <section className="panel">
        <h2>Subscriptions</h2>
        {subscriptions.isLoading ? (
          <PageState title="Loading subscriptions…" />
        ) : subscriptions.error ? (
          <ErrorState error={subscriptions.error} />
        ) : !subscriptions.data?.length ? (
          <PageState title="No GymOS subscriptions yet" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Gym</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Period end</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.data.map((s) => (
                  <tr key={s.id}>
                    <td>{s.gym?.name || s.gymId}</td>
                    <td>{s.planNameSnapshot}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td>
                      <StatusBadge status={s.payment?.status ?? (s.status === "TRIALING" ? "TRIAL" : "NOT_STARTED")} />
                      {s.payment?.providerOrderId && <><br /><small>{s.payment.providerOrderId}</small></>}
                    </td>
                    <td>{new Date(s.createdAt).toLocaleDateString("en-IN")}</td>
                    <td>
                      {s.currentPeriodEnd
                        ? new Date(s.currentPeriodEnd).toLocaleDateString(
                            "en-IN",
                          )
                        : "—"}
                    </td>
                    <td>
                      {s.status !== "ACTIVE" &&
                        (s.payment?.status === "SUCCESS" || s.status === "TRIALING") && (
                          <button
                            disabled={activateSubscription.isPending}
                            onClick={() => activateSubscription.mutate(s.id)}
                          >
                            Activate GymOS
                          </button>
                        )}
                      {s.status !== "SUSPENDED" && (
                        <button
                          className="button-danger"
                          onClick={() => {
                            const reason = window.prompt("Suspension reason");
                            if (reason && reason.length >= 5)
                              suspend.mutate({ id: s.id, reason });
                          }}
                        >
                          Suspend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
