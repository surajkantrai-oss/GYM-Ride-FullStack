"use client";
import type { GymPlan } from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { domainApi } from "@/lib/api";
const money = (minor: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    minor / 100,
  );
export default function PlansPage() {
  const gymId = useParams<{ gymId: string }>().gymId;
  const query = useQuery({
    queryKey: ["plans", gymId],
    queryFn: () => domainApi.plans.list(gymId),
  });
  return (
    <>
      <div className="breadcrumbs">
        <a href={`/gyms/${gymId}`}>Gym</a> / Plans
      </div>
      <PageHeader
        eyebrow="Commercial catalog"
        title="Plans"
        description="Create branch-specific passes and memberships. Prices are snapshotted when customers book."
        action={
          <a className="button" href={`/gyms/${gymId}/plans/new`}>
            Create plan
          </a>
        }
      />
      {query.isLoading ? (
        <PageState title="Loading plans…" />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data?.length ? (
        <PageState
          title="No plans yet"
          detail="Create a draft plan and assign at least one branch."
          action={
            <a className="button" href={`/gyms/${gymId}/plans/new`}>
              Create plan
            </a>
          }
        />
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
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((plan: GymPlan) => (
                <tr key={plan.id}>
                  <td>
                    <a href={`/gyms/${gymId}/plans/${plan.id}`}>
                      <strong>{plan.name}</strong>
                    </a>
                  </td>
                  <td>{plan.type.replaceAll("_", " ")}</td>
                  <td>{money(plan.priceMinor)}</td>
                  <td>{plan.branches.length}</td>
                  <td>
                    <StatusBadge status={plan.status} />
                  </td>
                  <td>
                    {new Date(plan.updatedAt).toLocaleDateString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
