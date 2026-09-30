"use client";
import type { GymBranch } from "@gymride/types";
import { branchSchema } from "@gymride/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field, pushToast } from "@gymride/web-ui";
import { api, json } from "@/lib/api";
export function BranchForm({
  gymId,
  branch,
}: {
  gymId: string;
  branch?: GymBranch;
}) {
  const router = useRouter();
  const cache = useQueryClient();
  const form = useForm<z.input<typeof branchSchema>>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      name: branch?.name ?? "",
      address: branch?.address ?? "",
      city: branch?.city ?? "",
      state: branch?.state ?? "",
      postalCode: branch?.postalCode ?? "",
      country: branch?.country ?? "IN",
      latitude: String(branch?.latitude ?? ""),
      longitude: String(branch?.longitude ?? ""),
      phone: branch?.phone ?? "",
      email: branch?.email ?? "",
      timezone: branch?.timezone ?? "Asia/Kolkata",
    },
  });
  const save = useMutation({
    mutationFn: (values: z.input<typeof branchSchema>) => {
      const parsed = branchSchema.parse(values);
      return api.request<GymBranch>(
        branch
          ? `/partner/branches/${branch.id}`
          : `/partner/gyms/${gymId}/branches`,
        {
          method: branch ? "PATCH" : "POST",
          body: json({
            ...parsed,
            phone: parsed.phone || undefined,
            email: parsed.email || undefined,
          }),
        },
      );
    },
    onSuccess: async (saved) => {
      pushToast(branch ? "Branch saved" : "Branch created");
      await cache.invalidateQueries({ queryKey: ["partner-gym", gymId] });
      router.push(`/gyms/${gymId}/branches/${saved.id}`);
    },
    onError: (error) =>
      pushToast(
        "Could not save branch",
        error instanceof Error ? error.message : undefined,
      ),
  });
  return (
    <form
      className="panel form-grid"
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <Field label="Branch name" error={form.formState.errors.name?.message}>
        <input {...form.register("name")} />
      </Field>
      <Field label="Phone" error={form.formState.errors.phone?.message}>
        <input
          inputMode="tel"
          placeholder="+919876543210"
          {...form.register("phone")}
        />
      </Field>
      <div className="span-2">
        <Field
          label="Street address"
          error={form.formState.errors.address?.message}
        >
          <input {...form.register("address")} />
        </Field>
      </div>
      <Field label="City" error={form.formState.errors.city?.message}>
        <input {...form.register("city")} />
      </Field>
      <Field label="State" error={form.formState.errors.state?.message}>
        <input {...form.register("state")} />
      </Field>
      <Field
        label="Postal code"
        error={form.formState.errors.postalCode?.message}
      >
        <input {...form.register("postalCode")} />
      </Field>
      <Field
        label="Country code"
        error={form.formState.errors.country?.message}
      >
        <input maxLength={2} {...form.register("country")} />
      </Field>
      <Field label="Latitude" error={form.formState.errors.latitude?.message}>
        <input inputMode="decimal" {...form.register("latitude")} />
      </Field>
      <Field label="Longitude" error={form.formState.errors.longitude?.message}>
        <input inputMode="decimal" {...form.register("longitude")} />
      </Field>
      <Field label="Email" error={form.formState.errors.email?.message}>
        <input type="email" {...form.register("email")} />
      </Field>
      <Field label="Timezone" error={form.formState.errors.timezone?.message}>
        <input {...form.register("timezone")} />
      </Field>
      <div className="span-2 card-actions">
        <button disabled={save.isPending}>
          {save.isPending
            ? "Saving…"
            : branch
              ? "Save branch"
              : "Create branch"}
        </button>
        <a className="button button-secondary" href={`/gyms/${gymId}/branches`}>
          Cancel
        </a>
      </div>
    </form>
  );
}
