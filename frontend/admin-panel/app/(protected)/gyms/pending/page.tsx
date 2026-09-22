import { Suspense } from "react";
import { PageState } from "@gymride/web-ui";
import { GymList } from "@/components/gym-list";
export default function PendingPage() {
  return (
    <Suspense fallback={<PageState title="Loading queue…" />}>
      <GymList lockedStatus="PENDING_APPROVAL" />
    </Suspense>
  );
}
