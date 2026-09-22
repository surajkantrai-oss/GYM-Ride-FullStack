"use client";
import type { OperatingHoursPeriod, Weekday } from "@gymride/types";
import { validateOperatingHours } from "@gymride/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorState, PageHeader, PageState, pushToast } from "@gymride/web-ui";
import { api, json } from "@/lib/api";
const days: Weekday[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
const defaults = (): OperatingHoursPeriod[] =>
  days.map((weekday) => ({ weekday, isClosed: true }));
const clock = (value?: string | null) =>
  !value ? "" : value.includes("T") ? value.slice(11, 16) : value.slice(0, 5);
export default function HoursPage() {
  const { gymId, branchId } = useParams<{ gymId: string; branchId: string }>();
  const cache = useQueryClient();
  const [periods, setPeriods] = useState<OperatingHoursPeriod[]>(defaults);
  const [errors, setErrors] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["hours", branchId],
    queryFn: () =>
      api.request<OperatingHoursPeriod[]>(
        `/partner/branches/${branchId}/operating-hours`,
      ),
  });
  useEffect(() => {
    if (query.data?.length) {
      const loaded = days.flatMap((day) => {
        const found = query.data.filter((item) => item.weekday === day);
        return found.length
          ? found.map((item) => ({
              ...item,
              opensAt: clock(item.opensAt),
              closesAt: clock(item.closesAt),
            }))
          : [{ weekday: day, isClosed: true }];
      });
      setPeriods(loaded);
    }
  }, [query.data]);
  const replace = (
    day: Weekday,
    index: number,
    patch: Partial<OperatingHoursPeriod>,
  ) =>
    setPeriods((items) => {
      const positions = items
        .map((item, position) => ({ item, position }))
        .filter(({ item }) => item.weekday === day);
      const target = positions[index]?.position;
      return target === undefined
        ? items
        : items.map((item, position) =>
            position === target ? { ...item, ...patch } : item,
          );
    });
  const toggleClosed = (day: Weekday, closed: boolean) =>
    setPeriods((items) =>
      [
        ...items.filter((item) => item.weekday !== day),
        ...(closed
          ? [{ weekday: day, isClosed: true }]
          : [
              {
                weekday: day,
                isClosed: false,
                opensAt: "06:00",
                closesAt: "22:00",
              },
            ]),
      ].sort((a, b) => days.indexOf(a.weekday) - days.indexOf(b.weekday)),
    );
  const add = (day: Weekday) =>
    setPeriods((items) =>
      [
        ...items,
        { weekday: day, isClosed: false, opensAt: "17:00", closesAt: "21:00" },
      ].sort((a, b) => days.indexOf(a.weekday) - days.indexOf(b.weekday)),
    );
  const remove = (day: Weekday, index: number) => {
    const dayItems = periods.filter((item) => item.weekday === day);
    if (dayItems.length === 1) return toggleClosed(day, true);
    setPeriods((items) => {
      let seen = -1;
      return items.filter((item) => item.weekday !== day || ++seen !== index);
    });
  };
  const save = useMutation({
    mutationFn: () =>
      api.request(`/partner/branches/${branchId}/operating-hours`, {
        method: "PUT",
        body: json({
          periods: periods.map(({ weekday, isClosed, opensAt, closesAt }) => ({
            weekday,
            isClosed,
            ...(!isClosed && { opensAt, closesAt }),
          })),
        }),
      }),
    onSuccess: async () => {
      setErrors([]);
      pushToast("Operating hours saved");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["hours", branchId] }),
        cache.invalidateQueries({ queryKey: ["branch", branchId] }),
      ]);
    },
    onError: (error) =>
      pushToast(
        "Could not save hours",
        error instanceof Error ? error.message : undefined,
      ),
  });
  const submit = () => {
    const validation = validateOperatingHours(periods);
    setErrors(validation);
    if (!validation.length) save.mutate();
  };
  if (query.isLoading) return <PageState title="Loading hours…" />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <>
      <div className="breadcrumbs">
        <a href={`/gyms/${gymId}/branches/${branchId}`}>Branch</a> / Operating
        hours
      </div>
      <PageHeader
        eyebrow="Weekly schedule"
        title="Operating hours"
        description="Closed days and split shifts are supported. Overlapping ranges are blocked."
      />
      {errors.length > 0 && (
        <div className="error-banner" role="alert">
          <strong>Fix the schedule</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <section className="panel">
        {days.map((day) => {
          const entries = periods.filter((item) => item.weekday === day);
          const closed = entries.length === 1 && entries[0].isClosed;
          return (
            <div className="hours-day" key={day}>
              <div className="data-row">
                <strong>{day[0] + day.slice(1).toLowerCase()}</strong>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={closed}
                    onChange={(event) =>
                      toggleClosed(day, event.target.checked)
                    }
                  />{" "}
                  Closed
                </label>
              </div>
              {!closed &&
                entries.map((period, index) => (
                  <div className="hours-row" key={`${day}-${index}`}>
                    <span>Shift {index + 1}</span>
                    <input
                      aria-label={`${day} shift ${index + 1} opens`}
                      type="time"
                      value={clock(period.opensAt)}
                      onChange={(event) =>
                        replace(day, index, { opensAt: event.target.value })
                      }
                    />
                    <input
                      aria-label={`${day} shift ${index + 1} closes`}
                      type="time"
                      value={clock(period.closesAt)}
                      onChange={(event) =>
                        replace(day, index, { closesAt: event.target.value })
                      }
                    />
                    <button
                      className="button-secondary"
                      onClick={() => remove(day, index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              {!closed && (
                <button className="button-ghost" onClick={() => add(day)}>
                  + Add split shift
                </button>
              )}
            </div>
          );
        })}
        <div className="card-actions">
          <button disabled={save.isPending} onClick={submit}>
            {save.isPending ? "Saving…" : "Save schedule"}
          </button>
          <a
            className="button button-secondary"
            href={`/gyms/${gymId}/branches/${branchId}`}
          >
            Back to branch
          </a>
        </div>
      </section>
    </>
  );
}
