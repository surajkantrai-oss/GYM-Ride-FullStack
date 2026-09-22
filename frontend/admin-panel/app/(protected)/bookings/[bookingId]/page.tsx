"use client";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
  formatDate,
} from "@gymride/web-ui";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { domainApi } from "@/lib/api";
import { checkInAudit } from "@/lib/check-in-visibility";
export default function AdminBookingPage() {
  const id = useParams<{ bookingId: string }>().bookingId;
  const query = useQuery({
    queryKey: ["admin-booking", id],
    queryFn: () => domainApi.bookings.getAdmin(id),
  });
  if (query.isLoading) return <PageState title="Loading booking…" />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  const booking = query.data;
  const audit = checkInAudit(booking.checkIn);
  return (
    <>
      <div className="breadcrumbs">
        <a href="/bookings">Bookings</a> / {booking.id.slice(0, 8)}
      </div>
      <PageHeader
        eyebrow="Platform booking"
        title={booking.planName}
        description={`${booking.gym.name} · ${booking.branch.name}`}
        action={<StatusBadge status={booking.status} />}
      />
      <div className="detail-grid">
        <section className="panel">
          <h2>Commercial snapshot</h2>
          <div className="data-list">
            <div className="data-row">
              <span>Booking ID</span>
              <code>{booking.id}</code>
            </div>
            <div className="data-row">
              <span>Plan type</span>
              <span>{booking.planType.replaceAll("_", " ")}</span>
            </div>
            <div className="data-row">
              <span>Amount</span>
              <strong>
                ₹{(booking.priceMinor / 100).toFixed(2)} {booking.currency}
              </strong>
            </div>
            <div className="data-row">
              <span>Created</span>
              <span>{formatDate(booking.createdAt)}</span>
            </div>
            <div className="data-row">
              <span>Expires</span>
              <span>{formatDate(booking.reservationExpiresAt)}</span>
            </div>
          </div>
        </section>
        <aside className="panel">
          <h2>Customer reference</h2>
          <p>
            {[booking.user.firstName, booking.user.lastName]
              .filter(Boolean)
              .join(" ") || "Customer"}
          </p>
          <code>{booking.user.id}</code>
          <p className="muted">
            Contact details are excluded from operational booking views.
          </p>
          <h2>Check-in audit</h2>
          {audit ? (
            <div className="data-list">
              <div className="data-row">
                <span>Status</span>
                <StatusBadge status={audit.status} />
              </div>
              <div className="data-row">
                <span>Method</span>
                <span>{audit.method}</span>
              </div>
              <div className="data-row">
                <span>Verified at</span>
                <span>{formatDate(audit.verifiedAt)}</span>
              </div>
              <div className="data-row">
                <span>Verified by</span>
                <code>{audit.verifiedByUserId ?? "—"}</code>
              </div>
            </div>
          ) : (
            <p className="muted">No check-in record exists.</p>
          )}
        </aside>
      </div>
      <section className="panel">
        <h2>Lifecycle events</h2>
        <ol className="audit-list">
          {booking.events?.map((event) => (
            <li key={event.id}>
              <strong>{event.type.replaceAll("_", " ")}</strong>
              <small>
                {event.fromStatus ?? "START"} → {event.toStatus} ·{" "}
                {formatDate(event.createdAt)}
              </small>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
