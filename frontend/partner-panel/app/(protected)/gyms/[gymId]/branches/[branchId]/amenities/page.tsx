"use client";
import type { Amenity, GymBranch } from "@gymride/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorState, PageHeader, PageState, pushToast } from "@gymride/web-ui";
import { api, json } from "@/lib/api";
export default function AmenitiesPage() {
  const { gymId, branchId } = useParams<{ gymId: string; branchId: string }>();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const amenities = useQuery({
    queryKey: ["amenities"],
    queryFn: () => api.request<Amenity[]>("/amenities"),
  });
  const branch = useQuery({
    queryKey: ["branch", branchId],
    queryFn: () => api.request<GymBranch>(`/partner/branches/${branchId}`),
  });
  useEffect(() => {
    if (branch.data)
      setSelected(
        branch.data.amenities?.map((item) =>
          "amenity" in item ? item.amenity.id : item.id,
        ) ?? [],
      );
  }, [branch.data]);
  const save = useMutation({
    mutationFn: () =>
      api.request(`/partner/branches/${branchId}/amenities`, {
        method: "PUT",
        body: json({ amenityIds: selected }),
      }),
    onSuccess: async () => {
      pushToast("Amenities saved");
      await cache.invalidateQueries({ queryKey: ["branch", branchId] });
    },
    onError: (error) =>
      pushToast(
        "Could not save amenities",
        error instanceof Error ? error.message : undefined,
      ),
  });
  if (amenities.isLoading || branch.isLoading)
    return <PageState title="Loading amenities…" />;
  if (amenities.error || branch.error)
    return <ErrorState error={amenities.error ?? branch.error} />;
  return (
    <>
      <div className="breadcrumbs">
        <a href={`/gyms/${gymId}/branches/${branchId}`}>Branch</a> / Amenities
      </div>
      <PageHeader
        eyebrow="Services"
        title="Branch amenities"
        description="Choose the facilities customers can expect at this location."
      />
      <section className="panel">
        <div className="checkbox-grid">
          {amenities.data?.map((amenity) => (
            <label className="check" key={amenity.id}>
              <input
                type="checkbox"
                checked={selected.includes(amenity.id)}
                onChange={(event) =>
                  setSelected((items) =>
                    event.target.checked
                      ? [...items, amenity.id]
                      : items.filter((id) => id !== amenity.id),
                  )
                }
              />
              <span>
                <strong>{amenity.name}</strong>
                {amenity.description && (
                  <small className="muted">{amenity.description}</small>
                )}
              </span>
            </label>
          ))}
        </div>
        <div className="card-actions" style={{ marginTop: "1rem" }}>
          <button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save amenities"}
          </button>
          <a
            className="button button-secondary"
            href={`/gyms/${gymId}/branches/${branchId}`}
          >
            Back to branch
          </a>
        </div>
      </section>
    </>
  );
}
