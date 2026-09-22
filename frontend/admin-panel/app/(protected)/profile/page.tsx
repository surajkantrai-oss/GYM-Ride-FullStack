"use client";
import { profileSchema } from "@gymride/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field, PageHeader, pushToast, useAuth } from "@gymride/web-ui";
import { api, json } from "@/lib/api";
export default function ProfilePage() {
  const { user, reloadProfile } = useAuth();
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: "", lastName: "", email: "" },
  });
  useEffect(() => {
    if (user)
      form.reset({
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        email: user.email ?? "",
      });
  }, [form, user]);
  const save = useMutation({
    mutationFn: (values: z.infer<typeof profileSchema>) =>
      api.request("/users/me", {
        method: "PATCH",
        body: json({ ...values, email: values.email || undefined }),
      }),
    onSuccess: async () => {
      await reloadProfile();
      pushToast("Profile saved");
    },
    onError: (error) =>
      pushToast(
        "Could not save",
        error instanceof Error ? error.message : undefined,
      ),
  });
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Your profile"
        description="Keep your administrator identity current."
      />
      <form
        className="panel form-grid"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <Field
          label="First name"
          error={form.formState.errors.firstName?.message}
        >
          <input {...form.register("firstName")} />
        </Field>
        <Field
          label="Last name"
          error={form.formState.errors.lastName?.message}
        >
          <input {...form.register("lastName")} />
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message}>
          <input type="email" {...form.register("email")} />
        </Field>
        <Field label="Mobile number">
          <input value={user?.phone ?? ""} disabled />
        </Field>
        <div className="span-2">
          <button disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </>
  );
}
