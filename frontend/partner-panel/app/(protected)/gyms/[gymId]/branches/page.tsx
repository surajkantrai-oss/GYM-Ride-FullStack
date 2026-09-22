"use client";
import type { GymBranch } from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
export default function BranchesPage() {
  const gymId = useParams<{ gymId: string }>().gymId;
  const query = useQuery({
    queryKey: ["branches", gymId],
    queryFn: () => api.request<GymBranch[]>(`/partner/gyms/${gymId}/branches`),
  });
  return (
    <>
      <div className="breadcrumbs">
        <a href={`/gyms/${gymId}`}>Gym profile</a> / Branches
      </div>
      <PageHeader
        eyebrow="Locations"
        title="Branches"
        description="Manage addresses, services, and schedules."
        action={
          <a className="button" href={`/gyms/${gymId}/branches/new`}>
            Add branch
          </a>
        }
      />
      {query.isLoading ? (
        <PageState title="Loading branches…" />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data?.length ? (
        <PageState
          title="No branches yet"
          action={
            <a className="button" href={`/gyms/${gymId}/branches/new`}>
              Add branch
            </a>
          }
        />
      ) : (
        <div className="card-grid">
          {query.data.map((branch) => (
            <a
              className="card"
              href={`/gyms/${gymId}/branches/${branch.id}`}
              key={branch.id}
            >
              <h3>{branch.name}</h3>
              <p>
                {branch.address}
                <br />
                {branch.city}, {branch.state} {branch.postalCode}
              </p>
              <StatusBadge status={branch.status} />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
