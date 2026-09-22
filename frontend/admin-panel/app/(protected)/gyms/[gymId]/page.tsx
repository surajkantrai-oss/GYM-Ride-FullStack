"use client";
import type { AuditRecord, GymPlan, GymSummary } from "@gymride/types";
import { reasonSchema } from "@gymride/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import {
  ConfirmDialog,
  ErrorState,
  Field,
  PageHeader,
  PageState,
  StatusBadge,
  formatDate,
  pushToast,
} from "@gymride/web-ui";
import { api, json } from "@/lib/api";

type SimpleAction = "approve" | "reactivate";
type ReasonAction = "reject" | "suspend";
export default function GymDetailPage() {
  const gymId = useParams<{ gymId: string }>().gymId;
  const cache = useQueryClient();
  const [confirm, setConfirm] = useState<SimpleAction | null>(null);
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const gym = useQuery({
    queryKey: ["admin-gym", gymId],
    queryFn: () => api.request<GymSummary>(`/admin/gyms/${gymId}`),
  });
  const audit = useQuery({
    queryKey: ["admin-gym-audit", gymId],
    queryFn: () => api.request<AuditRecord[]>(`/admin/gyms/${gymId}/audit`),
  });
  const plans = useQuery({
    queryKey: ["admin-gym-plans", gymId],
    queryFn: () => api.request<GymPlan[]>(`/admin/gyms/${gymId}/plans`),
  });
  const reasonForm = useForm<z.infer<typeof reasonSchema>>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: "" },
  });
  const action = useMutation({
    mutationFn: ({
      name,
      reason,
    }: {
      name: SimpleAction | ReasonAction;
      reason?: string;
    }) =>
      api.request(`/admin/gyms/${gymId}/${name}`, {
        method: "POST",
        ...(reason && { body: json({ reason }) }),
      }),
    onSuccess: async (_, values) => {
      pushToast(
        "Gym updated",
        `${values.name[0].toUpperCase()}${values.name.slice(1)} completed.`,
      );
      setConfirm(null);
      setReasonAction(null);
      reasonForm.reset();
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["admin-gym", gymId] }),
        cache.invalidateQueries({ queryKey: ["admin-gym-audit", gymId] }),
        cache.invalidateQueries({ queryKey: ["admin-summary"] }),
        cache.invalidateQueries({ queryKey: ["admin-gyms"] }),
      ]);
    },
    onError: (error) =>
      pushToast(
        "Action failed",
        error instanceof Error ? error.message : undefined,
      ),
  });
  if (gym.isLoading) return <PageState title="Loading gym profile…" />;
  if (gym.error || !gym.data)
    return <ErrorState error={gym.error} retry={() => void gym.refetch()} />;
  const data = gym.data;
  return (
    <>
      <div className="breadcrumbs">
        <a href="/gyms">Gyms</a> / {data.name}
      </div>
      <PageHeader
        eyebrow="Gym review"
        title={data.name}
        description={data.description || "No description supplied."}
        action={<StatusBadge status={data.status} />}
      />
      {data.statusReason && (
        <div className="reason-box">
          <strong>Latest review note</strong>
          <div>{data.statusReason}</div>
        </div>
      )}
      <div className="card-actions panel">
        {data.status === "PENDING_APPROVAL" && (
          <>
            <button onClick={() => setConfirm("approve")}>Approve gym</button>
            <button
              className="button-danger"
              onClick={() => setReasonAction("reject")}
            >
              Reject
            </button>
          </>
        )}
        {data.status === "APPROVED" && (
          <button
            className="button-danger"
            onClick={() => setReasonAction("suspend")}
          >
            Suspend
          </button>
        )}
        {data.status === "SUSPENDED" && (
          <button onClick={() => setConfirm("reactivate")}>Reactivate</button>
        )}
      </div>
      <div className="detail-grid">
        <section className="panel">
          <h2>Branches</h2>
          {!data.branches?.length ? (
            <p className="muted">No branches yet.</p>
          ) : (
            <div className="card-grid">
              {data.branches.map((branch) => (
                <article className="card" key={branch.id}>
                  <div>
                    <h3>{branch.name}</h3>
                    <p>
                      {branch.address}, {branch.city}, {branch.state}{" "}
                      {branch.postalCode}
                    </p>
                  </div>
                  <StatusBadge status={branch.status} />
                  <div>
                    <strong>Amenities</strong>
                    <p className="muted">
                      {branch.amenities
                        ?.map((item) =>
                          "amenity" in item ? item.amenity.name : item.name,
                        )
                        .join(", ") || "None configured"}
                    </p>
                  </div>
                  <div>
                    <strong>Operating hours</strong>
                    <ul>
                      {branch.operatingHours?.map((hours) => (
                        <li key={`${hours.weekday}-${hours.period}`}>
                          {hours.weekday}:{" "}
                          {hours.isClosed
                            ? "Closed"
                            : `${time(hours.opensAt)}–${time(hours.closesAt)}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <aside>
          <section className="panel">
            <h2>Owner</h2>
            <div className="data-list">
              <div className="data-row">
                <span>Name</span>
                <strong>
                  {data.owner
                    ? [data.owner.firstName, data.owner.lastName]
                        .filter(Boolean)
                        .join(" ") || "—"
                    : "—"}
                </strong>
              </div>
              <div className="data-row">
                <span>Phone</span>
                <span>{data.owner?.phone ?? "—"}</span>
              </div>
              <div className="data-row">
                <span>Email</span>
                <span>{data.owner?.email ?? "—"}</span>
              </div>
            </div>
          </section>
          <section className="panel">
            <h2>Audit trail</h2>
            {audit.isLoading ? (
              <p>Loading…</p>
            ) : audit.error ? (
              <p className="field-error">Audit history unavailable.</p>
            ) : !audit.data?.length ? (
              <p className="muted">No recorded decisions yet.</p>
            ) : (
              <ol className="audit-list">
                {audit.data.map((record) => (
                  <li key={record.id}>
                    <strong>{record.action.replaceAll("_", " ")}</strong>
                    <small>
                      {formatDate(record.createdAt)} ·{" "}
                      {record.actor
                        ? [record.actor.firstName, record.actor.lastName]
                            .filter(Boolean)
                            .join(" ") || "Administrator"
                        : "System"}
                    </small>
                    {record.metadata && (
                      <small>{String(record.metadata.reason ?? "")}</small>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
      <section className="panel">
        <h2>Plans</h2>
        {plans.isLoading ? (
          <p>Loading plans…</p>
        ) : !plans.data?.length ? (
          <p className="muted">No plans configured.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Type</th>
                  <th>Price</th>
                  <th>Branches</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {plans.data.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <strong>{plan.name}</strong>
                    </td>
                    <td>{plan.type.replaceAll("_", " ")}</td>
                    <td>₹{(plan.priceMinor / 100).toFixed(2)}</td>
                    <td>{plan.branches.length}</td>
                    <td>
                      <StatusBadge status={plan.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={`${confirm === "approve" ? "Approve" : "Reactivate"} this gym?`}
        description="This immediately changes its production visibility and records the decision in the audit trail."
        confirmLabel={confirm === "approve" ? "Approve" : "Reactivate"}
        busy={action.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && action.mutate({ name: confirm })}
      />
      {reasonAction && (
        <div className="dialog-backdrop">
          <form
            className="dialog stack"
            role="dialog"
            aria-modal="true"
            onSubmit={reasonForm.handleSubmit(({ reason }) =>
              action.mutate({ name: reasonAction, reason }),
            )}
          >
            <h2>{reasonAction === "reject" ? "Reject gym" : "Suspend gym"}</h2>
            <p>Explain the decision clearly. The partner will see this note.</p>
            <Field
              label="Reason"
              error={reasonForm.formState.errors.reason?.message}
            >
              <textarea autoFocus {...reasonForm.register("reason")} />
            </Field>
            <div className="dialog-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setReasonAction(null)}
              >
                Cancel
              </button>
              <button className="button-danger" disabled={action.isPending}>
                Confirm {reasonAction}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
function time(value?: string | null) {
  return value ? new Date(value).toISOString().slice(11, 16) : "—";
}
