"use client";
import type { GymSummary } from "@gymride/types";
import { gymSchema } from "@gymride/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field, pushToast } from "@gymride/web-ui";
import { api, json } from "@/lib/api";
export function GymForm({ gym }: { gym?: GymSummary }) {
  const router = useRouter();
  const cache = useQueryClient();
  const form = useForm<z.infer<typeof gymSchema>>({
    resolver: zodResolver(gymSchema),
    defaultValues: {
      name: gym?.name ?? "",
      description: gym?.description ?? "",
    },
  });
  const save = useMutation({
    mutationFn: (values: z.infer<typeof gymSchema>) =>
      api.request<GymSummary>(
        gym ? `/partner/gyms/${gym.id}` : "/partner/gyms",
        { method: gym ? "PATCH" : "POST", body: json(values) },
      ),
    onSuccess: async (saved) => {
      await cache.invalidateQueries({ queryKey: ["partner-gyms"] });
      pushToast(gym ? "Gym saved" : "Gym created");
      router.push(`/gyms/${saved.id}`);
    },
    onError: (error) =>
      pushToast(
        "Could not save gym",
        error instanceof Error ? error.message : undefined,
      ),
  });
  return (
    <form
      className="panel stack"
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <Field label="Gym name" error={form.formState.errors.name?.message}>
        <input autoFocus {...form.register("name")} />
      </Field>
      <Field
        label="Description"
        error={form.formState.errors.description?.message}
      >
        <textarea
          placeholder="What makes this gym distinctive?"
          {...form.register("description")}
        />
      </Field>
      <div className="card-actions">
        <button disabled={save.isPending}>
          {save.isPending ? "Saving…" : gym ? "Save changes" : "Create gym"}
        </button>
        <a
          className="button button-secondary"
          href={gym ? `/gyms/${gym.id}` : "/gyms"}
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
