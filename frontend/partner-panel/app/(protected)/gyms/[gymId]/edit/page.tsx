"use client";
import type { GymSummary } from "@gymride/types";
import { ErrorState, PageHeader, PageState } from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { GymForm } from "@/components/gym-form";
import { api } from "@/lib/api";
export default function EditGymPage() {
  const gymId = useParams<{ gymId: string }>().gymId;
  const query = useQuery({
    queryKey: ["partner-gym", gymId],
    queryFn: () => api.request<GymSummary>(`/partner/gyms/${gymId}`),
  });
  if (query.isLoading) return <PageState title="Loading gym…" />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  return (
    <>
      <PageHeader
        eyebrow="Profile editor"
        title={`Edit ${query.data.name}`}
        description="Changes are saved directly to the draft profile."
      />
      <GymForm gym={query.data} />
    </>
  );
}
