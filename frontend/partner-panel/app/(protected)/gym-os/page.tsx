"use client";
import type {
  GymOsAttendanceSummary,
  GymOsPlan,
  GymOsSubscription,
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
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { canManageGymOsBilling, hasGymOsAccess } from "@/lib/gym-os";

const money = (value: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100);
const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

export default function GymOsPage() {
  const cache = useQueryClient();
  const { user } = useAuth();
  const canBill = canManageGymOsBilling(user?.roles ?? []);
  const gyms = useQuery({
    queryKey: ["gymos-gyms"],
    queryFn: () =>
      api.request<PaginatedResponse<GymSummary>>(
        "/partner/gyms?page=1&limit=100",
      ),
  });
  const [selected, setSelected] = useState("");
  const gymId = selected || gyms.data?.data[0]?.id || "";
  const plans = useQuery({
    queryKey: ["gymos-plans"],
    queryFn: () => api.request<GymOsPlan[]>("/partner/gym-os/plans"),
  });
  const state = useQuery({
    queryKey: ["gymos-subscription", gymId],
    enabled: !!gymId,
    queryFn: () =>
      api.request<{
        subscription: GymOsSubscription | null;
        entitlements: { subscribed: boolean };
      }>(`/partner/gyms/${gymId}/gym-os/subscription`),
  });
  const subscribe = useMutation({
    mutationFn: async (planId: string) => {
      const result = await api.request<{
        subscription: GymOsSubscription;
        payment?: { id: string };
        checkout?: { orderId: string };
      }>(`/partner/gyms/${gymId}/gym-os/subscribe`, {
        method: "POST",
        headers: {
          "Idempotency-Key": `gymos-${gymId}-${planId}-${Date.now()}`,
        },
        body: JSON.stringify({ planId }),
      });
      if (result.payment && result.checkout) {
        const receipt = await api.request<{
          paymentId: string;
          signature: string;
        }>(
          `/partner/gyms/${gymId}/gym-os/payments/${result.payment.id}/simulate`,
          { method: "POST" },
        );
        await api.request(
          `/partner/gyms/${gymId}/gym-os/payments/${result.payment.id}/verify`,
          {
            method: "POST",
            body: JSON.stringify({
              orderId: result.checkout.orderId,
              providerPaymentId: receipt.paymentId,
              signature: receipt.signature,
            }),
          },
        );
      }
      return result;
    },
    onSuccess: async () => {
      pushToast(
        "GymOS request recorded",
        "Payment is verified when required. Admin activation is still pending.",
      );
      await cache.invalidateQueries({
        queryKey: ["gymos-subscription", gymId],
      });
    },
  });
  const cancel = useMutation({
    mutationFn: () =>
      api.request(`/partner/gyms/${gymId}/gym-os/cancel`, { method: "POST" }),
    onSuccess: async () => {
      pushToast(
        "Cancellation recorded",
        "Access remains until the period end when applicable.",
      );
      await cache.invalidateQueries({
        queryKey: ["gymos-subscription", gymId],
      });
    },
  });
  const current = state.data?.subscription;
  const active = hasGymOsAccess(current?.status);
  const awaitingActivation =
    current?.status === "TRIALING" ||
    (current?.status === "PENDING_PAYMENT" && current.payment?.status === "SUCCESS");
  const attendance = useQuery({
    queryKey: ["gymos-overview-attendance", gymId],
    enabled: !!gymId && active,
    queryFn: () =>
      api.request<GymOsAttendanceSummary>(
        `/partner/gyms/${gymId}/gym-os/attendance/summary`,
      ),
  });
  const selectedGym = useMemo(
    () => gyms.data?.data.find((g) => g.id === gymId),
    [gymId, gyms.data],
  );
  if (gyms.isLoading) return <PageState title="Loading GymOS…" />;
  if (gyms.error) return <ErrorState error={gyms.error} />;
  return (
    <>
      <PageHeader
        eyebrow="Paid gym management SaaS"
        title="GymOS"
        description="A separate operating system for your gym’s direct members and day-to-day management."
      />
      <section className="panel">
        <label className="field">
          <span>Current gym</span>
          <select value={gymId} onChange={(e) => setSelected(e.target.value)}>
            {gyms.data?.data.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      {!gymId ? (
        <PageState
          title="Create a gym first"
          detail="GymOS subscriptions belong to an individual gym business."
        />
      ) : state.isLoading ? (
        <PageState title="Checking subscription…" />
      ) : state.error ? (
        <ErrorState error={state.error} />
      ) : active && current ? (
        <>
          <section className="gymos-hero">
            <div>
              <span className="eyebrow">{selectedGym?.name}</span>
              <h1>{current.planNameSnapshot}</h1>
              <p>
                GymOS is available for this gym. Future member modules will use
                these backend-authoritative entitlements.
              </p>
            </div>
            <StatusBadge status={current.status} />
          </section>
          <section className="metric-grid">
            <article className="metric">
              <strong>{attendance.data?.todayCheckIns ?? "—"}</strong>
              <span>Today&apos;s check-ins</span>
            </article>
            <article className="metric">
              <strong>{attendance.data?.currentlyPresent ?? "—"}</strong>
              <span>Currently present</span>
            </article>
            <article className="metric">
              <strong>
                {money(current.priceMinorSnapshot, current.currencySnapshot)}
              </strong>
              <span>
                Per {current.billingInterval?.toLowerCase?.() || "period"}
              </span>
            </article>
            <article className="metric">
              <strong>{current.memberLimitSnapshot}</strong>
              <span>Member limit</span>
            </article>
            <article className="metric">
              <strong>{current.branchLimitSnapshot}</strong>
              <span>Branch limit</span>
            </article>
            <article className="metric">
              <strong>
                {current.currentPeriodEnd
                  ? new Date(current.currentPeriodEnd).toLocaleDateString(
                      "en-IN",
                    )
                  : current.trialEnd
                    ? new Date(current.trialEnd).toLocaleDateString("en-IN")
                    : "—"}
              </strong>
              <span>
                {current.status === "TRIALING" ? "Trial ends" : "Period ends"}
              </span>
            </article>
          </section>
          <section className="panel">
            <h2>Enabled modules</h2>
            <div className="feature-chips">
              {current.featuresSnapshot.map((f) => (
                <span key={f}>{label(f)}</span>
              ))}
            </div>
            <p className="muted">
              Capabilities are included in your plan; member-management screens
              begin in GymOS Phase 2.
            </p>
            {current.cancelAtPeriodEnd ? (
              <p className="notice-banner">
                Cancellation scheduled for period end.
              </p>
            ) : (
              canBill && (
                <button
                  className="button-secondary"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  Cancel at period end
                </button>
              )
            )}
          </section>
        </>
      ) : (
        <>
          {awaitingActivation && current && (
            <section className="notice-banner" role="status">
              <strong>GymOS activation pending</strong>
              <p>
                {current.planNameSnapshot} has been requested
                {current.payment?.status === "SUCCESS" ? " and payment is verified" : " as a trial"}.
                An Admin must activate it before protected GymOS modules unlock.
              </p>
            </section>
          )}
          <section className="gymos-hero">
            <div>
              <span className="eyebrow">GymOS for {selectedGym?.name}</span>
              <h1>Run your gym smarter.</h1>
              <p>
                Members, memberships, attendance, renewals and day-to-day gym
                operations in one place.
              </p>
            </div>
          </section>
          {plans.isLoading ? (
            <PageState title="Loading plans…" />
          ) : plans.error ? (
            <ErrorState error={plans.error} />
          ) : (
            <div className="gymos-plan-grid">
              {plans.data?.map((plan, index) => (
                <article
                  className={`card gymos-plan ${index === 1 ? "gymos-plan-featured" : ""}`}
                  key={plan.id}
                >
                  <span className="eyebrow">
                    {plan.trialDays
                      ? `${plan.trialDays}-day trial`
                      : "Paid plan"}
                  </span>
                  <h2>{plan.name}</h2>
                  <strong>
                    {money(plan.priceMinor, plan.currency)}
                    <small>/month</small>
                  </strong>
                  <p>{plan.description}</p>
                  <div className="data-list">
                    <div className="data-row">
                      <span>Members</span>
                      <b>{plan.memberLimit}</b>
                    </div>
                    <div className="data-row">
                      <span>Branches</span>
                      <b>{plan.branchLimit}</b>
                    </div>
                  </div>
                  <div className="feature-chips">
                    {plan.features.slice(0, 6).map((f) => (
                      <span key={f.feature}>✓ {label(f.feature)}</span>
                    ))}
                  </div>
                  <button
                    disabled={!canBill || subscribe.isPending || awaitingActivation}
                    onClick={() => subscribe.mutate(plan.id)}
                  >
                    {awaitingActivation
                      ? "Activation pending"
                      : plan.trialDays
                        ? "Request trial"
                        : "Subscribe"}
                  </button>
                </article>
              ))}
            </div>
          )}
          {!canBill && (
            <div className="notice-banner">
              You can view GymOS plans, but only a gym owner can manage billing.
            </div>
          )}
        </>
      )}
    </>
  );
}
