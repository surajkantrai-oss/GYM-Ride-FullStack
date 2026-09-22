import { PageHeader } from "@gymride/web-ui";
import { GymForm } from "@/components/gym-form";
export default function NewGymPage() {
  return (
    <>
      <PageHeader
        eyebrow="New profile"
        title="Create a gym"
        description="Start with the essentials, then add branches and hours."
      />
      <GymForm />
    </>
  );
}
