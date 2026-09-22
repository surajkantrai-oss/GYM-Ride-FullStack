"use client";
import { PageHeader } from "@gymride/web-ui";
import { useParams } from "next/navigation";
import { BranchForm } from "@/components/branch-form";
export default function NewBranchPage() {
  const gymId = useParams<{ gymId: string }>().gymId;
  return (
    <>
      <PageHeader
        eyebrow="New location"
        title="Add a branch"
        description="Coordinates power nearby discovery, so enter them carefully."
      />
      <BranchForm gymId={gymId} />
    </>
  );
}
