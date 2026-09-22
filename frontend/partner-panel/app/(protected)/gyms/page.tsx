"use client";
import type { GymSummary, PaginatedResponse } from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/lib/api";
function List() {
  const params = useSearchParams();
  const router = useRouter();
  const page = Number(params.get("page") ?? 1);
  const search = params.get("search") ?? "";
  const [term, setTerm] = useState(search);
  const query = useQuery({
    queryKey: ["partner-gyms", page, search],
    queryFn: () =>
      api.request<PaginatedResponse<GymSummary>>(
        `/partner/gyms?${new URLSearchParams({ page: String(page), limit: "20", ...(search && { search }) })}`,
      ),
  });
  const move = (nextPage: number, nextSearch = search) =>
    router.push(
      `/gyms?${new URLSearchParams({ page: String(nextPage), ...(nextSearch && { search: nextSearch }) })}`,
    );
  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="My gyms"
        description="Build, refine, and submit each gym profile."
        action={
          <a className="button" href="/gyms/new">
            Create gym
          </a>
        }
      />
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          move(1, term);
        }}
      >
        <input
          aria-label="Search gyms"
          placeholder="Search by gym name"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        <span />
        <button>Search</button>
      </form>
      {query.isLoading ? (
        <PageState title="Loading gyms…" />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data?.data.length ? (
        <PageState
          title="No gyms yet"
          detail="Create your first gym to begin."
          action={
            <a className="button" href="/gyms/new">
              Create gym
            </a>
          }
        />
      ) : (
        <>
          <div className="card-grid">
            {query.data.data.map((gym) => (
              <a className="card" href={`/gyms/${gym.id}`} key={gym.id}>
                <div>
                  <h3>{gym.name}</h3>
                  <p className="muted">
                    {gym.description || "No description yet"}
                  </p>
                </div>
                <div className="data-row">
                  <span>{gym.branches?.length ?? 0} branches</span>
                  <StatusBadge status={gym.status} />
                </div>
                {gym.statusReason && (
                  <div className="reason-box">{gym.statusReason}</div>
                )}
              </a>
            ))}
          </div>
          <div className="pagination">
            <button
              className="button-secondary"
              disabled={!query.data.meta.hasPreviousPage}
              onClick={() => move(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {query.data.meta.page} of{" "}
              {Math.max(1, query.data.meta.totalPages)}
            </span>
            <button
              className="button-secondary"
              disabled={!query.data.meta.hasNextPage}
              onClick={() => move(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}
export default function GymsPage() {
  return (
    <Suspense fallback={<PageState title="Loading gyms…" />}>
      <List />
    </Suspense>
  );
}
