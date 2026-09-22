"use client";
import { slotConfigSchema } from "@gymride/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import {
  ErrorState,
  Field,
  PageHeader,
  PageState,
  StatusBadge,
  pushToast,
} from "@gymride/web-ui";
import { domainApi } from "@/lib/api";
const today = () => new Date().toISOString().slice(0, 10);
export default function SlotSettingsPage() {
  const { gymId, branchId } = useParams<{ gymId: string; branchId: string }>();
  const cache = useQueryClient();
  const [date, setDate] = useState(today);
  const config = useQuery({
    queryKey: ["slot-config", branchId],
    queryFn: () => domainApi.slots.config(branchId),
  });
  const form = useForm<z.input<typeof slotConfigSchema>>({
    resolver: zodResolver(slotConfigSchema),
    defaultValues: {
      slotDurationMinutes: 60,
      defaultCapacity: 20,
      bookingWindowDays: 30,
      minimumAdvanceMinutes: 60,
      isActive: true,
    },
  });
  useEffect(() => {
    if (config.data) form.reset(config.data);
  }, [config.data, form]);
  const save = useMutation({
    mutationFn: (values: z.input<typeof slotConfigSchema>) =>
      domainApi.slots.saveConfig(branchId, slotConfigSchema.parse(values)),
    onSuccess: async () => {
      pushToast(
        "Slot settings saved",
        "Future unbooked slots were regenerated safely.",
      );
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["slot-config", branchId] }),
        cache.invalidateQueries({ queryKey: ["availability", branchId] }),
      ]);
    },
    onError: (error) =>
      pushToast(
        "Could not save settings",
        error instanceof Error ? error.message : undefined,
      ),
  });
  const availability = useQuery({
    queryKey: ["availability", branchId, date],
    queryFn: () => domainApi.slots.availability(branchId, date),
    enabled: Boolean(config.data),
  });
  return (
    <>
      <div className="breadcrumbs">
        <a href={`/gyms/${gymId}/branches/${branchId}`}>Branch</a> / Slot
        settings
      </div>
      <PageHeader
        eyebrow="Inventory"
        title="Slot settings"
        description="Slots follow branch-local operating hours and are generated only through the booking horizon."
      />
      {config.isLoading ? (
        <PageState title="Loading settings…" />
      ) : config.error ? (
        <ErrorState error={config.error} />
      ) : (
        <form
          className="panel form-grid"
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <Field
            label="Slot duration (minutes)"
            error={form.formState.errors.slotDurationMinutes?.message}
          >
            <input
              type="number"
              min={15}
              max={180}
              {...form.register("slotDurationMinutes")}
            />
          </Field>
          <Field
            label="Default capacity"
            error={form.formState.errors.defaultCapacity?.message}
          >
            <input
              type="number"
              min={1}
              max={1000}
              {...form.register("defaultCapacity")}
            />
          </Field>
          <Field
            label="Booking window (days)"
            error={form.formState.errors.bookingWindowDays?.message}
          >
            <input
              type="number"
              min={1}
              max={90}
              {...form.register("bookingWindowDays")}
            />
          </Field>
          <Field
            label="Minimum advance (minutes)"
            error={form.formState.errors.minimumAdvanceMinutes?.message}
          >
            <input
              type="number"
              min={0}
              max={43200}
              {...form.register("minimumAdvanceMinutes")}
            />
          </Field>
          <label className="check span-2">
            <input type="checkbox" {...form.register("isActive")} /> Generate
            and publish slot availability
          </label>
          <div className="span-2">
            <button disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save and regenerate"}
            </button>
          </div>
        </form>
      )}
      <section className="panel">
        <div className="page-header">
          <div>
            <span className="eyebrow">Real inventory preview</span>
            <h2>Availability</h2>
          </div>
          <input
            aria-label="Preview date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            style={{ maxWidth: 190 }}
          />
        </div>
        {!config.data ? (
          <PageState title="Configure slots first" />
        ) : availability.isLoading ? (
          <PageState title="Generating preview…" />
        ) : availability.error ? (
          <ErrorState
            error={availability.error}
            retry={() => void availability.refetch()}
          />
        ) : !availability.data?.length ? (
          <PageState
            title="No slots for this date"
            detail="The branch may be closed or outside configured operating periods."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Capacity</th>
                  <th>Reserved</th>
                  <th>Confirmed</th>
                  <th>Available</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {availability.data.map((slot) => (
                  <tr key={slot.id}>
                    <td>
                      {new Date(slot.startAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      –
                      {new Date(slot.endAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>{slot.capacity}</td>
                    <td>{slot.reserved}</td>
                    <td>{slot.confirmed}</td>
                    <td>
                      <strong>{slot.available}</strong>
                    </td>
                    <td>
                      <StatusBadge status={slot.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
