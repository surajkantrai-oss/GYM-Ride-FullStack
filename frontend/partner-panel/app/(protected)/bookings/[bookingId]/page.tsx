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
export default function BookingPage() {
  const id = useParams<{ bookingId: string }>().bookingId;
  const query = useQuery({
    queryKey: ["partner-booking", id],
    queryFn: () => domainApi.bookings.getPartner(id),
  });
  if (query.isLoading) return <PageState title="Loading booking…" />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  const booking = query.data;
  return (
    <>
      <div className="breadcrumbs">
        <a href={`/bookings?gymId=${booking.gymId}`}>Bookings</a> /{" "}
        {booking.id.slice(0, 8)}
      </div>
      <PageHeader
        eyebrow="Booking detail"
        title={booking.planName}
        description={`${booking.gym.name} · ${booking.branch.name}`}
        action={<StatusBadge status={booking.status} />}
      />
      <div className="detail-grid">
        <section className="panel">
          <h2>Reservation</h2>
          <div className="data-list">
            <div className="data-row">
              <span>Booking ID</span>
              <code>{booking.id}</code>
            </div>
            <div className="data-row">
              <span>Slot</span>
              <span>
                {booking.slot
                  ? `${formatDate(booking.slot.startAt)} – ${formatDate(booking.slot.endAt)}`
                  : "Membership purchase"}
              </span>
            </div>
            <div className="data-row">
              <span>Price snapshot</span>
              <strong>₹{(booking.priceMinor / 100).toFixed(2)}</strong>
            </div>
            <div className="data-row">
              <span>Reservation expires</span>
              <span>{formatDate(booking.reservationExpiresAt)}</span>
            </div>
          </div>
        </section>
        <aside className="panel">
          <h2>Customer</h2>
          <p>
            {[booking.user.firstName, booking.user.lastName]
              .filter(Boolean)
              .join(" ") || "Customer"}
          </p>
          <p className="muted">
            Sensitive contact details are intentionally omitted.
          </p>
          <h2>Check-in</h2>
          {booking.checkIn ? (
            <div className="data-list">
              <div className="data-row">
                <span>Status</span>
                <StatusBadge status={booking.checkIn.status} />
              </div>
              <div className="data-row">
                <span>Method</span>
                <span>{booking.checkIn.method ?? "Not verified"}</span>
              </div>
              <div className="data-row">
                <span>Verified</span>
                <span>{formatDate(booking.checkIn.verifiedAt)}</span>
              </div>
            </div>
          ) : (
            <p className="muted">No check-in record yet.</p>
          )}
        </aside>
      </div>
      <section className="panel">
        <h2>Event history</h2>
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
