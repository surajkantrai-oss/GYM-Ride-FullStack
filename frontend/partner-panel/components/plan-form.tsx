"use client";
import type { GymPlan, GymSummary } from "@gymride/types";
import {
  minorToRupees,
  planFormSchema,
  rupeesToMinor,
} from "@gymride/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field, PageState, pushToast } from "@gymride/web-ui";
import { api, domainApi } from "@/lib/api";

export function PlanForm({ gymId, plan }: { gymId: string; plan?: GymPlan }) {
  const router = useRouter();
  const gym = useQuery({
    queryKey: ["partner-gym", gymId],
    queryFn: () => api.request<GymSummary>(`/partner/gyms/${gymId}`),
  });
  const form = useForm<z.input<typeof planFormSchema>>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      name: plan?.name ?? "",
      description: plan?.description ?? "",
      type: plan?.type ?? "DAY_PASS",
      price: plan ? minorToRupees(plan.priceMinor) : "",
      currency: "INR",
      visitLimit: plan?.visitLimit ?? "",
      branchIds: plan?.branches.map((item) => item.branch.id) ?? [],
    },
  });
  const save = useMutation({
    mutationFn: (values: z.input<typeof planFormSchema>) => {
      const parsed = planFormSchema.parse(values);
      const { price, ...fields } = parsed;
      const payload = {
        ...fields,
        priceMinor: rupeesToMinor(price),
        visitLimit: parsed.visitLimit || undefined,
        branchIds: parsed.branchIds,
      };
      return plan
        ? domainApi.plans.update(plan.id, payload)
        : domainApi.plans.create(gymId, payload);
    },
    onSuccess: (saved) => {
      pushToast(plan ? "Plan saved" : "Plan created");
      router.push(`/gyms/${gymId}/plans/${saved.id}`);
    },
    onError: (error) =>
      pushToast(
        "Could not save plan",
        error instanceof Error ? error.message : undefined,
      ),
  });
  if (gym.isLoading) return <PageState title="Loading branches…" />;
  return (
    <form
      className="panel form-grid"
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <Field label="Plan name" error={form.formState.errors.name?.message}>
        <input {...form.register("name")} />
      </Field>
      <Field label="Plan type" error={form.formState.errors.type?.message}>
        <select {...form.register("type")}>
          <option value="DAY_PASS">Day pass</option>
          <option value="MONTHLY">Monthly</option>
          <option value="QUARTERLY">Quarterly</option>
          <option value="YEARLY">Yearly</option>
        </select>
      </Field>
      <Field label="Price (₹)" error={form.formState.errors.price?.message}>
        <input
          inputMode="decimal"
          placeholder="199.00"
          {...form.register("price")}
        />
      </Field>
      <Field
        label="Visit limit (optional)"
        error={form.formState.errors.visitLimit?.message}
      >
        <input inputMode="numeric" {...form.register("visitLimit")} />
      </Field>
      <div className="span-2">
        <Field
          label="Description"
          error={form.formState.errors.description?.message}
        >
          <textarea {...form.register("description")} />
        </Field>
      </div>
      <fieldset className="span-2">
        <legend>Available branches</legend>
        <div className="checkbox-grid">
          {gym.data?.branches?.map((branch) => (
            <label className="check" key={branch.id}>
              <input
                type="checkbox"
                value={branch.id}
                {...form.register("branchIds")}
              />{" "}
              {branch.name} · {branch.city}
            </label>
          ))}
        </div>
        {form.formState.errors.branchIds?.message && (
          <small className="field-error">
            {form.formState.errors.branchIds.message}
          </small>
        )}
      </fieldset>
      <div className="span-2 card-actions">
        <button disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save plan"}
        </button>
        <a className="button button-secondary" href={`/gyms/${gymId}/plans`}>
          Cancel
        </a>
      </div>
    </form>
  );
}
