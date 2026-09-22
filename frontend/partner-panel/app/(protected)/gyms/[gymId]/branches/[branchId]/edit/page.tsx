"use client";
import type { GymBranch } from "@gymride/types";
import { ErrorState, PageHeader, PageState } from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { BranchForm } from "@/components/branch-form";
import { api } from "@/lib/api";
export default function EditBranchPage() {
  const { gymId, branchId } = useParams<{ gymId: string; branchId: string }>();
  const query = useQuery({
    queryKey: ["branch", branchId],
    queryFn: () => api.request<GymBranch>(`/partner/branches/${branchId}`),
  });
  if (query.isLoading) return <PageState title="Loading branch…" />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  return (
    <>
      <PageHeader
        eyebrow="Location editor"
        title={`Edit ${query.data.name}`}
        description="Keep contact details and discovery coordinates accurate."
      />
      <BranchForm gymId={gymId} branch={query.data} />
    </>
  );
}
