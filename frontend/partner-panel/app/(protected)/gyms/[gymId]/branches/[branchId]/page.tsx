"use client";
import type { GymBranch } from "@gymride/types";
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
import { api, json } from "@/lib/api";
export default function BranchPage() {
  const { gymId, branchId } = useParams<{ gymId: string; branchId: string }>();
  const cache = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({
    queryKey: ["branch", branchId],
    queryFn: () => api.request<GymBranch>(`/partner/branches/${branchId}`),
  });
  const toggle = useMutation({
    mutationFn: (status: "ACTIVE" | "INACTIVE") =>
      api.request(`/partner/branches/${branchId}`, {
        method: "PATCH",
        body: json({ status }),
      }),
    onSuccess: async () => {
      setConfirm(false);
      pushToast("Branch status updated");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["branch", branchId] }),
        cache.invalidateQueries({ queryKey: ["branches", gymId] }),
      ]);
    },
    onError: (error) =>
      pushToast(
        "Could not update status",
        error instanceof Error ? error.message : undefined,
      ),
  });
  if (query.isLoading) return <PageState title="Loading branch…" />;
  if (query.error || !query.data)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const branch = query.data;
  const target = branch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  return (
    <>
      <div className="breadcrumbs">
        <a href={`/gyms/${gymId}`}>Gym</a> /{" "}
        <a href={`/gyms/${gymId}/branches`}>Branches</a> / {branch.name}
      </div>
      <PageHeader
        eyebrow="Branch"
        title={branch.name}
        description={`${branch.address}, ${branch.city}, ${branch.state} ${branch.postalCode}`}
        action={<StatusBadge status={branch.status} />}
      />
      <section className="panel card-actions">
        <a
          className="button button-secondary"
          href={`/gyms/${gymId}/branches/${branchId}/edit`}
        >
          Edit details
        </a>
        <a
          className="button button-secondary"
          href={`/gyms/${gymId}/branches/${branchId}/amenities`}
        >
          Amenities
        </a>
        <a
          className="button button-secondary"
          href={`/gyms/${gymId}/branches/${branchId}/operating-hours`}
        >
          Operating hours
        </a>
        <a
          className="button button-secondary"
          href={`/gyms/${gymId}/branches/${branchId}/slot-settings`}
        >
          Slot settings
        </a>
        {branch.status !== "SUSPENDED" && (
          <button
            className={target === "INACTIVE" ? "button-danger" : ""}
            onClick={() => setConfirm(true)}
          >
            {target === "ACTIVE" ? "Activate" : "Deactivate"}
          </button>
        )}
      </section>
      <div className="detail-grid">
        <section className="panel">
          <h2>Contact & location</h2>
          <div className="data-list">
            <div className="data-row">
              <span>Phone</span>
              <span>{branch.phone || "—"}</span>
            </div>
            <div className="data-row">
              <span>Email</span>
              <span>{branch.email || "—"}</span>
            </div>
            <div className="data-row">
              <span>Coordinates</span>
              <span>
                {String(branch.latitude)}, {String(branch.longitude)}
              </span>
            </div>
            <div className="data-row">
              <span>Timezone</span>
              <span>{branch.timezone}</span>
            </div>
          </div>
        </section>
        <section className="panel">
          <h2>Readiness</h2>
          <div className="data-list">
            <div className="data-row">
              <span>Amenities</span>
              <strong>{branch.amenities?.length ?? 0}</strong>
            </div>
            <div className="data-row">
              <span>Schedule entries</span>
              <strong>{branch.operatingHours?.length ?? 0}</strong>
            </div>
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={confirm}
        title={`${target === "ACTIVE" ? "Activate" : "Deactivate"} this branch?`}
        description={
          target === "ACTIVE"
            ? "Customers can discover and use this location once its gym is approved."
            : "This location will no longer be available for normal customer activity."
        }
        confirmLabel={
          target === "ACTIVE" ? "Activate branch" : "Deactivate branch"
        }
        danger={target === "INACTIVE"}
        busy={toggle.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => toggle.mutate(target)}
      />
    </>
  );
}
