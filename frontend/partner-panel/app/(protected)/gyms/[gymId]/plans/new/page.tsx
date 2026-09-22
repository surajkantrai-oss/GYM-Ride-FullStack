"use client";
import { PageHeader } from "@gymride/web-ui";
import { useParams } from "next/navigation";
import { PlanForm } from "@/components/plan-form";
export default function NewPlanPage() {
  const gymId = useParams<{ gymId: string }>().gymId;
  return (
    <>
      <PageHeader
        eyebrow="New offering"
        title="Create a plan"
        description="Enter customer-facing pricing in rupees; GYMRide stores the exact paise value."
      />
      <PlanForm gymId={gymId} />
    </>
  );
}
