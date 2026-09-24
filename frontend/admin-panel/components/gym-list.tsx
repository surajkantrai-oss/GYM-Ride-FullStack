"use client";
import type { GymStatus, GymSummary, PaginatedResponse } from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

const statuses: Array<{ value: GymStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "SUSPENDED", label: "Suspended" },
];
export function GymList({ lockedStatus }: { lockedStatus?: GymStatus }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const page = Number(params.get("page") ?? 1);
  const search = params.get("search") ?? "";
  const status =
    lockedStatus ?? (params.get("status") as GymStatus | null) ?? "";
  const [term, setTerm] = useState(search);
  const query = useQuery({
    queryKey: ["admin-gyms", page, search, status],
    queryFn: () =>
      api.request<PaginatedResponse<GymSummary>>(
        `/admin/gyms?${new URLSearchParams({ page: String(page), limit: "20", ...(search && { search }), ...(status && { status }) })}`,
      ),
  });
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    router.push(`${pathname}?${next}`);
  };
  return (
    <>
      <PageHeader
        eyebrow={lockedStatus ? "Approval queue" : "Directory"}
        title={lockedStatus ? "Pending gyms" : "All gyms"}
        description="Search and filter production records without losing your place."
      />
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          update({ search: term, page: "1" });
        }}
      >
        <input
          aria-label="Search gyms"
          placeholder="Search gym, branch, or city"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        {!lockedStatus && (
          <select
            aria-label="Status"
            value={status}
            onChange={(event) =>
              update({ status: event.target.value, page: "1" })
            }
          >
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        )}
        <button>Search</button>
      </form>
      {query.isLoading ? (
        <PageState title="Loading gyms…" />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data?.data.length ? (
        <PageState
          title="No gyms found"
          detail="Try changing your search or filter."
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Gym</th>
                  <th>Owner</th>
                  <th>Branches</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((gym, index) => (
                  <tr key={gym.id}>
                    <td>
                      <a className="table-gym" href={`/gyms/${gym.id}`}>
                        <span
                          className="table-gym-image"
                          style={{
                            backgroundImage: `url(/images/${["gym-warm.jpg", "gym-strength.jpg", "gym-airy.jpg"][index % 3]})`,
                          }}
                        />
                        <strong>{gym.name}</strong>
                      </a>
                    </td>
                    <td>
                      {gym.owner
                        ? [gym.owner.firstName, gym.owner.lastName]
                            .filter(Boolean)
                            .join(" ") || gym.owner.phone
                        : "—"}
                    </td>
                    <td>{gym.branches?.length ?? 0}</td>
                    <td>
                      <StatusBadge status={gym.status} />
                    </td>
                    <td>
                      {gym.updatedAt
                        ? new Date(gym.updatedAt).toLocaleDateString("en-IN")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              className="button-secondary"
              disabled={!query.data.meta.hasPreviousPage}
              onClick={() => update({ page: String(page - 1) })}
            >
              Previous
            </button>
            <span>
              Page {query.data.meta.page} of{" "}
              {Math.max(query.data.meta.totalPages, 1)}
            </span>
            <button
              className="button-secondary"
              disabled={!query.data.meta.hasNextPage}
              onClick={() => update({ page: String(page + 1) })}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}
