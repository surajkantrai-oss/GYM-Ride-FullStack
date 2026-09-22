"use client";
import type { Booking, BookingStatus } from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { domainApi } from "@/lib/api";
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
  const page = Number(params.get("page") ?? 1);
  const status = params.get("status") ?? "";
  const gymId = params.get("gymId") ?? "";
  const branchId = params.get("branchId") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const queryString = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(status && { status }),
    ...(gymId && { gymId }),
    ...(branchId && { branchId }),
    ...(from && { from }),
    ...(to && { to }),
  });
  const query = useQuery({
    queryKey: ["admin-bookings", queryString.toString()],
    queryFn: () => domainApi.bookings.admin(`?${queryString}`),
  });
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.set("page", "1");
    router.push(`/bookings?${next}`);
  };
  return (
    <>
      <PageHeader
        eyebrow="Platform ledger"
        title="Bookings"
        description="Read-only visibility across reservations, capacity holds, and lifecycle events."
      />
      <div
        className="toolbar"
        style={{ gridTemplateColumns: "repeat(3,minmax(160px,1fr))" }}
      >
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => update("status", event.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <input
          aria-label="Gym ID"
          placeholder="Gym ID"
          value={gymId}
          onChange={(event) => update("gymId", event.target.value)}
        />
        <input
          aria-label="Branch ID"
          placeholder="Branch ID"
          value={branchId}
          onChange={(event) => update("branchId", event.target.value)}
        />
        <input
          aria-label="Created from"
          type="date"
          value={from}
          onChange={(event) => update("from", event.target.value)}
        />
        <input
          aria-label="Created to"
          type="date"
          value={to}
          onChange={(event) => update("to", event.target.value)}
        />
      </div>
      {query.isLoading ? (
        <PageState title="Loading bookings…" />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data?.data.length ? (
        <PageState title="No bookings found" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Customer</th>
                  <th>Gym / branch</th>
                  <th>Plan</th>
                  <th>Slot</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((booking: Booking) => (
                  <tr key={booking.id}>
                    <td>
                      <a href={`/bookings/${booking.id}`}>
                        <strong>{booking.id.slice(0, 8)}</strong>
                      </a>
                    </td>
                    <td>
                      {[booking.user.firstName, booking.user.lastName]
                        .filter(Boolean)
                        .join(" ") || booking.user.id.slice(0, 8)}
                    </td>
                    <td>
                      {booking.gym.name}
                      <br />
                      <small>{booking.branch.name}</small>
                    </td>
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
                    <td>
                      {new Date(booking.createdAt).toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              className="button-secondary"
              disabled={!query.data.meta.hasPreviousPage}
              onClick={() => update("page", String(page - 1))}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, query.data.meta.totalPages)}
            </span>
            <button
              className="button-secondary"
              disabled={!query.data.meta.hasNextPage}
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
export default function AdminBookingsPage() {
  return (
    <Suspense fallback={<PageState title="Loading booking filters…" />}>
      <BookingList />
    </Suspense>
  );
}
