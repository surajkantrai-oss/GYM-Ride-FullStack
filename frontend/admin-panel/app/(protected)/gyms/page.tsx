import { Suspense } from "react";
import { PageState } from "@gymride/web-ui";
import { GymList } from "@/components/gym-list";
export default function GymsPage() {
  return (
    <Suspense fallback={<PageState title="Loading directory…" />}>
      <GymList />
    </Suspense>
  );
}
