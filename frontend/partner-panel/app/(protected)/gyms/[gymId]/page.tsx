"use client";
import type { GymSummary } from "@gymride/types";
import { ApiError } from "@gymride/api-client";
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
import { api } from "@/lib/api";
import { canEditGym, submissionRequirementLabel } from "@/lib/submission";
export default function GymPage() {
  const gymId = useParams<{ gymId: string }>().gymId;
  const cache = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["partner-gym", gymId],
    queryFn: () => api.request<GymSummary>(`/partner/gyms/${gymId}`),
  });
  const submit = useMutation({
    mutationFn: () =>
      api.request(`/partner/gyms/${gymId}/submit`, { method: "POST" }),
    onSuccess: async () => {
      setConfirm(false);
      setMissing([]);
      pushToast("Submitted for review");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["partner-gym", gymId] }),
        cache.invalidateQueries({ queryKey: ["partner-summary"] }),
      ]);
    },
    onError: (error) => {
      setConfirm(false);
      const value =
        error instanceof ApiError
          ? (error.details as { missing?: string[] })
          : undefined;
      const items = value?.missing ?? [];
      setMissing(items);
      pushToast(
        "Submission needs attention",
        error instanceof Error ? error.message : undefined,
      );
    },
  });
  if (query.isLoading) return <PageState title="Loading gym…" />;
  if (query.error || !query.data)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const gym = query.data;
  const editable = canEditGym(gym.status);
  return (
    <>
      <div className="breadcrumbs">
        <a href="/gyms">My gyms</a> / {gym.name}
      </div>
      <PageHeader
        eyebrow="Gym profile"
        title={gym.name}
        description={gym.description || "No description supplied."}
        action={<StatusBadge status={gym.status} />}
      />
      {gym.statusReason && (
        <div className="reason-box">
          <strong>Reviewer feedback</strong>
          <div>{gym.statusReason}</div>
        </div>
      )}
      {missing.length > 0 && (
        <section className="reason-box">
          <strong>Complete these requirements</strong>
          <ul>
            {missing.map((item) => (
              <li key={item}>{submissionRequirementLabel(item)}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel card-actions">
        {editable && (
          <a className="button button-secondary" href={`/gyms/${gymId}/edit`}>
            Edit gym
          </a>
        )}
        <a className="button button-secondary" href={`/gyms/${gymId}/branches`}>
          Manage branches
        </a>
        <a className="button button-secondary" href={`/gyms/${gymId}/plans`}>
          Manage plans
        </a>
        {editable && (
          <button onClick={() => setConfirm(true)}>Submit for review</button>
        )}
      </section>
      <section className="panel">
        <h2>Branches</h2>
        {!gym.branches?.length ? (
          <PageState
            title="No branches yet"
            detail="A gym needs at least one branch before review."
            action={
              <a className="button" href={`/gyms/${gymId}/branches/new`}>
                Add branch
              </a>
            }
          />
        ) : (
          <div className="card-grid">
            {gym.branches.map((branch) => (
              <a
                className="card"
                href={`/gyms/${gymId}/branches/${branch.id}`}
                key={branch.id}
              >
                <h3>{branch.name}</h3>
                <p className="muted">{branch.city}</p>
                <StatusBadge status={branch.status} />
              </a>
            ))}
          </div>
        )}
      </section>
      <ConfirmDialog
        open={confirm}
        title="Submit this gym for review?"
        description="Your profile will become read-only while administrators review it. Confirm every branch and schedule is accurate."
        confirmLabel="Submit gym"
        busy={submit.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => submit.mutate()}
      />
    </>
  );
}
