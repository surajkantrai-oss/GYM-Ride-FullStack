"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  ConfirmDialog,
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
  pushToast,
} from "@gymride/web-ui";
import { PlanForm } from "@/components/plan-form";
import { domainApi } from "@/lib/api";
export default function PlanPage() {
  const { gymId, planId } = useParams<{ gymId: string; planId: string }>();
  const cache = useQueryClient();
  const [confirm, setConfirm] = useState<"activate" | "deactivate" | null>(
    null,
  );
  const query = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => domainApi.plans.get(planId),
  });
  const status = useMutation({
    mutationFn: (action: "activate" | "deactivate") =>
      action === "activate"
        ? domainApi.plans.activate(planId)
        : domainApi.plans.deactivate(planId),
    onSuccess: async (_, action) => {
      setConfirm(null);
      pushToast(`Plan ${action}d`);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["plan", planId] }),
        cache.invalidateQueries({ queryKey: ["plans", gymId] }),
      ]);
    },
    onError: (error) =>
      pushToast(
        "Could not update plan",
        error instanceof Error ? error.message : undefined,
      ),
  });
  if (query.isLoading) return <PageState title="Loading plan…" />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  const plan = query.data;
  return (
    <>
      <div className="breadcrumbs">
        <a href={`/gyms/${gymId}/plans`}>Plans</a> / {plan.name}
      </div>
      <PageHeader
        eyebrow="Plan editor"
        title={plan.name}
        description={`${plan.type.replaceAll("_", " ")} · ${plan.durationDays} day term`}
        action={<StatusBadge status={plan.status} />}
      />
      {plan.status !== "ARCHIVED" && (
        <section className="panel card-actions">
          {plan.status === "ACTIVE" ? (
            <button
              className="button-danger"
              onClick={() => setConfirm("deactivate")}
            >
              Deactivate plan
            </button>
          ) : (
            <button onClick={() => setConfirm("activate")}>
              Activate plan
            </button>
          )}
        </section>
      )}
      <PlanForm gymId={gymId} plan={plan} />
      <ConfirmDialog
        open={Boolean(confirm)}
        title={`${confirm === "activate" ? "Activate" : "Deactivate"} this plan?`}
        description={
          confirm === "activate"
            ? "Customers will be able to book this plan at its assigned active branches."
            : "New bookings will stop; historical bookings and price snapshots remain unchanged."
        }
        confirmLabel={
          confirm === "activate" ? "Activate plan" : "Deactivate plan"
        }
        danger={confirm === "deactivate"}
        busy={status.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && status.mutate(confirm)}
      />
    </>
  );
}
