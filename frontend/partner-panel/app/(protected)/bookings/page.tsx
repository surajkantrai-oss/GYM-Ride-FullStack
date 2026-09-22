"use client";
import type {
  Booking,
  BookingStatus,
  GymBranch,
  GymSummary,
  PaginatedResponse,
} from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { api, domainApi } from "@/lib/api";
const statuses: BookingStatus[] = [
  "PAYMENT_PENDING",
  "CONFIRMED",
  "CHECK_IN_AVAILABLE",
  "CHECKED_IN",
  "CANCELLED",
  "EXPIRED",
  "PAYMENT_FAILED",
  "COMPLETED",
  "NO_SHOW",
  "REFUNDED",
];
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    value / 100,
  );
function BookingList() {
  const params = useSearchParams();
  const router = useRouter();
  const gymId = params.get("gymId") ?? "";
  const branchId = params.get("branchId") ?? "";
  const status = params.get("status") ?? "";
  const date = params.get("date") ?? "";
  const page = Number(params.get("page") ?? 1);
  const gyms = useQuery({
    queryKey: ["partner-gyms", "booking-filter"],
    queryFn: () =>
      api.request<PaginatedResponse<GymSummary>>(
        "/partner/gyms?page=1&limit=100",
      ),
  });
  useEffect(() => {
    if (!gymId && gyms.data?.data[0])
      router.replace(`/bookings?gymId=${gyms.data.data[0].id}`);
  }, [gymId, gyms.data, router]);
  const branches = useQuery({
    queryKey: ["branches", gymId],
    queryFn: () => api.request<GymBranch[]>(`/partner/gyms/${gymId}/branches`),
    enabled: Boolean(gymId),
  });
  const queryString = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(gymId && { gymId }),
    ...(branchId && { branchId }),
    ...(status && { status }),
    ...(date && { date }),
  });
  const bookings = useQuery({
    queryKey: ["partner-bookings", queryString.toString()],
    queryFn: () => domainApi.bookings.partner(`?${queryString}`),
    enabled: Boolean(gymId),
  });
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.set("page", "1");
    if (key === "gymId") next.delete("branchId");
    if (key === "gymId") next.delete("date");
    router.push(`/bookings?${next}`);
  };
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Bookings"
        description="Authorized customer reservations across your gyms and branches."
      />
      <div
        className="toolbar"
        style={{ gridTemplateColumns: "repeat(4,minmax(150px,1fr))" }}
      >
        <select
          aria-label="Gym"
          value={gymId}
          onChange={(event) => update("gymId", event.target.value)}
        >
          <option value="">Select gym</option>
          {gyms.data?.data.map((gym) => (
            <option value={gym.id} key={gym.id}>
              {gym.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Branch"
          value={branchId}
          onChange={(event) => update("branchId", event.target.value)}
        >
          <option value="">All branches</option>
          {branches.data?.map((branch) => (
            <option value={branch.id} key={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => update("status", event.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((item) => (
            <option value={item} key={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <input
          aria-label="Slot date"
          type="date"
          disabled={!branchId}
          value={date}
          onChange={(event) => update("date", event.target.value)}
        />
      </div>
      {!gymId ? (
        <PageState title="Select a gym" />
      ) : bookings.isLoading ? (
        <PageState title="Loading bookings…" />
      ) : bookings.error ? (
        <ErrorState
          error={bookings.error}
          retry={() => void bookings.refetch()}
        />
      ) : !bookings.data?.data.length ? (
        <PageState
          title="No bookings found"
          detail="No reservations match the selected filters."
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Customer</th>
                  <th>Branch</th>
                  <th>Plan</th>
                  <th>Slot</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.data.data.map((booking: Booking) => (
                  <tr key={booking.id}>
                    <td>
                      <a href={`/bookings/${booking.id}`}>
                        <strong>{booking.id.slice(0, 8)}</strong>
                      </a>
                    </td>
                    <td>
                      {[booking.user.firstName, booking.user.lastName]
                        .filter(Boolean)
                        .join(" ") || "Customer"}
                    </td>
                    <td>{booking.branch.name}</td>
                    <td>{booking.planName}</td>
                    <td>
                      {booking.slot
                        ? new Date(booking.slot.startAt).toLocaleString("en-IN")
                        : "Membership"}
                    </td>
                    <td>{money(booking.priceMinor)}</td>
                    <td>
                      <StatusBadge status={booking.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              className="button-secondary"
              disabled={!bookings.data.meta.hasPreviousPage}
              onClick={() => update("page", String(page - 1))}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, bookings.data.meta.totalPages)}
            </span>
            <button
              className="button-secondary"
              disabled={!bookings.data.meta.hasNextPage}
              onClick={() => update("page", String(page + 1))}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}
export default function BookingsPage() {
  return (
    <Suspense fallback={<PageState title="Loading booking filters…" />}>
      <BookingList />
    </Suspense>
  );
}
