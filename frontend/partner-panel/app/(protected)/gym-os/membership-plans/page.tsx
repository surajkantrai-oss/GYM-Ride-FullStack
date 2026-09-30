"use client";

import type {
  GymBranch,
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
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

export default function MembershipPlansPage() {
  const cache = useQueryClient();
  const { user } = useAuth();
  const [gymId, setGymId] = useState("");
  const canWrite = !!user?.roles.some(
    (role) => role === "GYM_OWNER" || role === "GYM_MANAGER",
  );
  const gyms = useQuery({
    queryKey: ["membership-plan-gyms"],
    queryFn: () =>
      api.request<PaginatedResponse<GymSummary>>(
        "/partner/gyms?page=1&limit=100",
      ),
  });
  const selectedGym = gymId || gyms.data?.data[0]?.id || "";
  const plans = useQuery({
    queryKey: ["membership-plans", selectedGym],
    enabled: !!selectedGym,
    queryFn: () =>
      api.request<GymOsMembershipPlan[]>(
        `/partner/gyms/${selectedGym}/gym-os/membership-plans`,
      ),
  });
  const branches = useQuery({
    queryKey: ["membership-plan-branches", selectedGym],
    enabled: !!selectedGym,
    queryFn: () =>
      api.request<GymBranch[]>(`/partner/gyms/${selectedGym}/branches`),
  });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request(`/partner/gyms/${selectedGym}/gym-os/membership-plans`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      pushToast("Plan created", "The membership plan is ready for review.");
      await cache.invalidateQueries({
        queryKey: ["membership-plans", selectedGym],
      });
    },
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.request(
        `/partner/gyms/${selectedGym}/gym-os/membership-plans/${id}/${action}`,
        { method: "POST" },
      ),
    onSuccess: async () =>
      cache.invalidateQueries({ queryKey: ["membership-plans", selectedGym] }),
  });
  const edit = useMutation({
    mutationFn: ({
      plan,
      name,
      priceMinor,
    }: {
      plan: GymOsMembershipPlan;
      name: string;
      priceMinor: number;
    }) =>
      api.request(
        `/partner/gyms/${selectedGym}/gym-os/membership-plans/${plan.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name, priceMinor }),
        },
      ),
    onSuccess: async () =>
      cache.invalidateQueries({ queryKey: ["membership-plans", selectedGym] }),
  });
  return (
    <>
      <PageHeader
        eyebrow="GymOS · membership catalogue"
        title="Membership plans"
        description="Create reusable duration and branch rules. Member assignments retain an immutable plan snapshot."
      />
      <section className="panel filter-row">
        <select
          value={selectedGym}
          onChange={(event) => setGymId(event.target.value)}
          aria-label="Gym"
        >
          {(gyms.data?.data || []).map((gym) => (
            <option key={gym.id} value={gym.id}>
              {gym.name}
            </option>
          ))}
        </select>
      </section>
      {canWrite && selectedGym && (
        <section className="panel">
          <h2>Create plan</h2>
          <form
            className="form-grid"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const values = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              const branchIds = new FormData(event.currentTarget)
                .getAll("branchIds")
                .map(String);
              create.mutate({
                code: String(values.code),
                name: String(values.name),
                description: String(values.description || "") || undefined,
                durationValue: Number(values.durationValue),
                durationType: String(values.durationType),
                priceMinor: Number(values.priceMinor || 0),
                currency: String(values.currency || "INR"),
                branchIds,
              });
            }}
          >
            <label className="field">
              <span>Code</span>
              <input name="code" required placeholder="MONTHLY" />
            </label>
            <label className="field">
              <span>Currency</span>
              <select name="currency" defaultValue="INR">
                <option>INR</option>
              </select>
            </label>
            <label className="field">
              <span>Name</span>
              <input name="name" required placeholder="Monthly membership" />
            </label>
            <label className="field">
              <span>Duration</span>
              <input
                name="durationValue"
                type="number"
                min="1"
                defaultValue="1"
                required
              />
            </label>
            <label className="field">
              <span>Duration unit</span>
              <select name="durationType" defaultValue="MONTHS">
                <option>DAYS</option>
                <option>WEEKS</option>
                <option>MONTHS</option>
              </select>
            </label>
            <label className="field">
              <span>Reference price (minor units)</span>
              <input
                name="priceMinor"
                type="number"
                min="0"
                defaultValue="0"
                required
              />
            </label>
            <label className="field">
              <span>Description</span>
              <input name="description" />
            </label>
            <fieldset className="span-2">
              <legend>Applicable branches (none means all)</legend>
              <div className="button-row">
                {(branches.data || []).map((branch) => (
                  <label key={branch.id}>
                    <input type="checkbox" name="branchIds" value={branch.id} />{" "}
                    {branch.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="span-2">
              <button disabled={create.isPending}>Create plan</button>
            </div>
          </form>
        </section>
      )}
      {plans.isLoading ? (
        <PageState title="Loading membership plans…" />
      ) : plans.error ? (
        <ErrorState error={plans.error} />
      ) : !plans.data?.length ? (
        <PageState
          title="No membership plans yet"
          detail="Create the first plan to assign memberships."
        />
      ) : (
        <section className="card-grid">
          {plans.data.map((plan) => (
            <article className="panel" key={plan.id}>
              <div className="data-row">
                <div>
                  <small>{plan.code}</small>
                  <h2>{plan.name}</h2>
                </div>
                <StatusBadge status={plan.status} />
              </div>
              <p>{plan.description || "No description"}</p>
              <div className="data-list">
                <div className="data-row">
                  <span>Duration</span>
                  <b>
                    {plan.durationValue} {plan.durationType.toLowerCase()}
                  </b>
                </div>
                <div className="data-row">
                  <span>Reference price</span>
                  <b>{`${plan.currency} ${(plan.priceMinor / 100).toFixed(2)}`}</b>
                </div>
                <div className="data-row">
                  <span>Branches</span>
                  <b>
                    {plan.branches.length
                      ? `${plan.branches.length} selected`
                      : "All branches"}
                  </b>
                </div>
              </div>
              {canWrite && (
                <div className="button-row">
                  {plan.status !== "ARCHIVED" && (
                    <button
                      className="secondary"
                      onClick={() => {
                        const name = window.prompt("Plan name", plan.name);
                        const price = window.prompt(
                          "Reference price in minor units",
                          String(plan.priceMinor),
                        );
                        if (name && price != null && Number(price) >= 0)
                          edit.mutate({
                            plan,
                            name,
                            priceMinor: Number(price),
                          });
                      }}
                    >
                      Edit
                    </button>
                  )}
                  {plan.status !== "ACTIVE" && plan.status !== "ARCHIVED" && (
                    <button
                      onClick={() =>
                        changeStatus.mutate({ id: plan.id, action: "activate" })
                      }
                    >
                      Activate
                    </button>
                  )}
                  {plan.status === "ACTIVE" && (
                    <button
                      className="secondary"
                      onClick={() =>
                        changeStatus.mutate({
                          id: plan.id,
                          action: "deactivate",
                        })
                      }
                    >
                      Deactivate
                    </button>
                  )}
                  {plan.status !== "ARCHIVED" && (
                    <button
                      className="secondary"
                      onClick={() =>
                        changeStatus.mutate({ id: plan.id, action: "archive" })
                      }
                    >
                      Archive
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
