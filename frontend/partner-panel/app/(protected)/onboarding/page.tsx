"use client";
import { PageHeader } from "@gymride/web-ui";
import { GymForm } from "@/components/gym-form";

export default function PartnerOnboardingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Free marketplace onboarding"
        title="Welcome to GYMRide"
        description="Register your gym to list it on GYMRide. A GymOS subscription is not required."
      />
      <section className="panel stack">
        <h2>Register your gym</h2>
        <p className="muted">
          Your gym starts as a draft. After creation, add a branch, operating
          hours, amenities, marketplace plans and slot settings, then submit it
          for Admin review.
        </p>
      </section>
      <GymForm onboarding />
    </>
  );
}
