"use client";
import { profileSchema } from "@gymride/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field, PageHeader, pushToast, useAuth } from "@gymride/web-ui";
import { api, json } from "@/lib/api";
export default function ProfilePage() {
  const { user, reloadProfile } = useAuth();
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
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
  const uploadPhoto = useMutation({
    mutationFn: async () => {
      if (!photo) return;
      const body = new FormData();
      body.append("file", photo.file);
      await api.request("/users/me/photo", { method: "POST", body });
    },
    onSuccess: async () => {
      await reloadProfile();
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto(null);
      pushToast("Profile photo updated");
    },
    onError: (error) =>
      pushToast(
        "Could not upload photo",
        error instanceof Error ? error.message : undefined,
      ),
  });
  const removePhoto = useMutation({
    mutationFn: () => api.request("/users/me/photo", { method: "DELETE" }),
    onSuccess: async () => {
      await reloadProfile();
      pushToast("Profile photo removed");
    },
  });
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Your profile"
        description="The identity used across your gym portfolio."
      />
      <form
        className="panel form-grid"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <section
          className="profile-photo-editor span-2"
          aria-labelledby="profile-photo-title"
        >
          <div className="profile-photo-preview">
            {photo?.url || user?.avatarUrl ? (
              <img
                src={photo?.url || user?.avatarUrl || ""}
                alt="Profile photo preview"
              />
            ) : (
              <span aria-hidden="true">
                {(user?.firstName || "G").slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <strong id="profile-photo-title">Profile photo</strong>
            <p className="muted">
              JPEG, PNG or WebP · cropped securely to a square.
            </p>
            <div className="card-actions">
              <label className="button button-secondary file-button">
                Choose photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 8 * 1024 * 1024) {
                      pushToast(
                        "Image too large",
                        "Choose an image smaller than 8 MB.",
                      );
                      return;
                    }
                    if (photo) URL.revokeObjectURL(photo.url);
                    setPhoto({ file, url: URL.createObjectURL(file) });
                  }}
                />
              </label>
              {photo && (
                <button
                  type="button"
                  disabled={uploadPhoto.isPending}
                  onClick={() => uploadPhoto.mutate()}
                >
                  {uploadPhoto.isPending ? "Uploading…" : "Save photo"}
                </button>
              )}
              {user?.avatarUrl && (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={removePhoto.isPending}
                  onClick={() => removePhoto.mutate()}
                >
                  {removePhoto.isPending ? "Removing…" : "Remove photo"}
                </button>
              )}
            </div>
          </div>
        </section>
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
