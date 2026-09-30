"use client";
import type { GymOsMembershipPlan } from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
export default function AdminMembershipPlansPage() {
  const [gymId, setGymId] = useState("");
  const query = useQuery({
    queryKey: ["admin-membership-plans", gymId],
    queryFn: () =>
      api.request<GymOsMembershipPlan[]>(
        `/admin/gym-os/membership-plans?page=1&pageSize=100${gymId ? `&gymId=${gymId}` : ""}`,
      ),
  });
  return (
    <>
      <PageHeader
        eyebrow="GymOS oversight · read only"
        title="Membership plans"
        description="Cross-gym plan visibility without partner mutation privileges."
      />
      <section className="panel filter-row">
        <input
          placeholder="Filter by Gym UUID"
          value={gymId}
          onChange={(e) => setGymId(e.target.value)}
        />
      </section>
      {query.isLoading ? (
        <PageState title="Loading plans…" />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : !query.data?.length ? (
        <PageState title="No plans found" />
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Gym</th>
                <th>Code</th>
                <th>Name</th>
                <th>Duration</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((plan) => (
                <tr key={plan.id}>
                  <td>{plan.gym?.name}</td>
                  <td>{plan.code}</td>
                  <td>{plan.name}</td>
                  <td>
                    {plan.durationValue} {plan.durationType.toLowerCase()}
                  </td>
                  <td>
                    {`${plan.currency} ${(plan.priceMinor / 100).toFixed(2)}`}
                  </td>
                  <td>
                    <StatusBadge status={plan.status} />
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
