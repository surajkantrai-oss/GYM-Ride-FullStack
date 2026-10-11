"use client";
import type { GymImage, GymSummary } from "@gymride/types";
import { gymSchema } from "@gymride/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field, pushToast, useAuth } from "@gymride/web-ui";
import { api, gymImageUrl, json } from "@/lib/api";

type PendingImage = { file: File; url: string };
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 8 * 1024 * 1024;

function preview(file: File): PendingImage {
  return { file, url: URL.createObjectURL(file) };
}

async function hasSupportedImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return jpeg || png || webp;
}

export function GymForm({
  gym,
  onboarding = false,
}: {
  gym?: GymSummary;
  onboarding?: boolean;
}) {
  const router = useRouter();
  const cache = useQueryClient();
  const { reloadProfile } = useAuth();
  const [cover, setCover] = useState<PendingImage | null>(null);
  const [gallery, setGallery] = useState<PendingImage[]>([]);
  const [uploadProgress, setUploadProgress] = useState("");
  const pendingRef = useRef<{
    cover: PendingImage | null;
    gallery: PendingImage[];
  }>({
    cover: null,
    gallery: [],
  });
  useEffect(() => {
    pendingRef.current = { cover, gallery };
  }, [cover, gallery]);
  useEffect(
    () => () => {
      if (pendingRef.current.cover)
        URL.revokeObjectURL(pendingRef.current.cover.url);
      pendingRef.current.gallery.forEach((image) =>
        URL.revokeObjectURL(image.url),
      );
    },
    [],
  );
  const form = useForm<z.infer<typeof gymSchema>>({
    resolver: zodResolver(gymSchema),
    defaultValues: {
      name: gym?.name ?? "",
      description: gym?.description ?? "",
    },
  });
  const save = useMutation({
    mutationFn: async (values: z.infer<typeof gymSchema>) => {
      const saved = await api.request<GymSummary>(
        gym ? `/partner/gyms/${gym.id}` : "/partner/gyms",
        { method: gym ? "PATCH" : "POST", body: json(values) },
      );
      const pending = [
        ...(cover ? [{ ...cover, kind: "COVER" }] : []),
        ...gallery.map((image) => ({ ...image, kind: "GALLERY" })),
      ];
      const failedUploads: string[] = [];
      for (const [index, image] of pending.entries()) {
        setUploadProgress(`Uploading image ${index + 1} of ${pending.length}…`);
        const body = new FormData();
        body.append("file", image.file);
        body.append("kind", image.kind);
        body.append("sortOrder", String(index));
        try {
          await api.request(`/partner/gyms/${saved.id}/images`, {
            method: "POST",
            body,
          });
        } catch (error) {
          failedUploads.push(
            `${image.file.name}: ${error instanceof Error ? error.message : "upload failed"}`,
          );
        }
      }
      return { saved, failedUploads };
    },
    onSuccess: async ({ saved, failedUploads }) => {
      if (onboarding) {
        await api.restore();
        await reloadProfile();
      }
      await cache.invalidateQueries({ queryKey: ["partner-gyms"] });
      await cache.invalidateQueries({ queryKey: ["partner-gym", saved.id] });
      await cache.invalidateQueries({
        queryKey: ["partner-access-relationship"],
      });
      if (failedUploads.length) {
        pushToast(
          gym
            ? "Gym saved; some images failed"
            : "Gym created; some images failed",
          `${failedUploads.length} image${failedUploads.length === 1 ? "" : "s"} could not be uploaded. Open Edit gym to retry.`,
        );
      } else {
        pushToast(gym ? "Gym saved" : "Gym created");
      }
      router.push(`/gyms/${saved.id}`);
      router.refresh();
    },
    onError: (error) =>
      pushToast(
        "Could not save gym",
        error instanceof Error ? error.message : undefined,
      ),
  });
  const removeImage = useMutation({
    mutationFn: (imageId: string) =>
      api.request(`/partner/gyms/${gym?.id}/images/${imageId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["partner-gym", gym?.id] });
      pushToast("Image removed");
    },
  });
  const makeCover = useMutation({
    mutationFn: (imageId: string) =>
      api.request(`/partner/gyms/${gym?.id}/images/${imageId}`, {
        method: "PATCH",
        body: json({ kind: "COVER" }),
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["partner-gym", gym?.id] });
      pushToast("Cover image updated");
    },
  });
  const acceptFiles = async (files: File[], kind: "COVER" | "GALLERY") => {
    const invalid = files.find(
      (file) => !acceptedImageTypes.has(file.type) || file.size > maxImageBytes,
    );
    if (invalid) {
      pushToast(
        "Image not accepted",
        "Use JPEG, PNG or WebP files smaller than 8 MB.",
      );
      return;
    }
    const signatures = await Promise.all(files.map(hasSupportedImageSignature));
    if (signatures.some((supported) => !supported)) {
      pushToast(
        "Image not accepted",
        "The selected file contents are not JPEG, PNG or WebP. Convert the image and try again.",
      );
      return;
    }
    if (kind === "COVER" && files[0]) {
      if (cover) URL.revokeObjectURL(cover.url);
      setCover(preview(files[0]));
    } else {
      setGallery((current) => [
        ...current,
        ...files.slice(0, 10 - current.length).map(preview),
      ]);
    }
  };
  const persisted = gym?.images ?? [];
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
      <section className="image-editor" aria-labelledby="cover-image-label">
        <div>
          <strong id="cover-image-label">Gym cover image</strong>
          <small>JPEG, PNG or WebP · up to 8 MB</small>
        </div>
        <label
          className="image-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void acceptFiles([...event.dataTransfer.files], "COVER");
          }}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) =>
              void acceptFiles([...(event.target.files ?? [])], "COVER")
            }
          />
          {cover ? (
            <img src={cover.url} alt="New gym cover preview" />
          ) : persisted.find((image) => image.kind === "COVER") ? (
            <img
              src={gymImageUrl(
                persisted.find((image) => image.kind === "COVER")!.id,
              )}
              alt={`${gym?.name} cover`}
            />
          ) : (
            <span>Drop a cover here or click to choose</span>
          )}
        </label>
      </section>
      <section className="image-editor" aria-labelledby="gallery-images-label">
        <div>
          <strong id="gallery-images-label">Gym gallery</strong>
          <small>
            Add up to 10 interior, equipment or workout-area images.
          </small>
        </div>
        <label
          className="image-dropzone image-dropzone-compact"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void acceptFiles([...event.dataTransfer.files], "GALLERY");
          }}
        >
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) =>
              void acceptFiles([...(event.target.files ?? [])], "GALLERY")
            }
          />
          <span>Drop gallery images here or click to choose</span>
        </label>
        {(persisted.length > 0 || gallery.length > 0) && (
          <div className="image-preview-grid">
            {persisted.map((image: GymImage) => (
              <article key={image.id}>
                <img
                  src={gymImageUrl(image.id)}
                  alt={`${gym?.name} ${image.kind.toLowerCase()}`}
                />
                <div className="image-preview-actions">
                  {image.kind !== "COVER" && (
                    <button
                      type="button"
                      onClick={() => makeCover.mutate(image.id)}
                    >
                      Make cover
                    </button>
                  )}
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => removeImage.mutate(image.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
            {gallery.map((image) => (
              <article key={image.url}>
                <img src={image.url} alt="New gallery preview" />
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    URL.revokeObjectURL(image.url);
                    setGallery((items) =>
                      items.filter((item) => item !== image),
                    );
                  }}
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      {uploadProgress && (
        <p className="muted" role="status">
          {uploadProgress}
        </p>
      )}
      <div className="card-actions">
        <button disabled={save.isPending}>
          {save.isPending ? "Saving…" : gym ? "Save changes" : "Create gym"}
        </button>
        {!onboarding && (
          <a
            className="button button-secondary"
            href={gym ? `/gyms/${gym.id}` : "/gyms"}
          >
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
