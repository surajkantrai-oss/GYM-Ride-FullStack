"use client";
import type { CheckInVerificationResult } from "@gymride/types";
import { PageHeader, StatusBadge, formatDate } from "@gymride/web-ui";
import { useMutation } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { domainApi } from "@/lib/api";
import { checkInErrorMessage, checkInViewState } from "@/lib/check-in";

function Verified({ result }: { result: CheckInVerificationResult }) {
  return (
    <section className="panel" aria-live="polite">
      <div className="notice-banner">Check-in verified</div>
      <div className="data-list">
        <div className="data-row">
          <span>Customer</span>
          <strong>
            {[result.user.firstName, result.user.lastName]
              .filter(Boolean)
              .join(" ") || "Customer"}
          </strong>
        </div>
        <div className="data-row">
          <span>Booking</span>
          <code>{result.id}</code>
        </div>
        <div className="data-row">
          <span>Gym / branch</span>
          <span>
            {result.gym.name} · {result.branch.name}
          </span>
        </div>
        <div className="data-row">
          <span>Plan</span>
          <span>{result.planName}</span>
        </div>
        <div className="data-row">
          <span>Status</span>
          <StatusBadge status={result.status} />
        </div>
        <div className="data-row">
          <span>Verified</span>
          <span>{formatDate(result.checkIn?.verifiedAt)}</span>
        </div>
      </div>
    </section>
  );
}

export default function CheckInsPage() {
  const [token, setToken] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [otp, setOtp] = useState("");
  const qr = useMutation({
    mutationFn: () => domainApi.checkIns.verifyQr(token.trim()),
    onSuccess: () => setToken(""),
  });
  const fallback = useMutation({
    mutationFn: () =>
      domainApi.checkIns.verifyOtp(bookingId.trim(), otp.trim()),
    onSuccess: () => setOtp(""),
  });
  const result = qr.data ?? fallback.data;
  const reset = () => {
    qr.reset();
    fallback.reset();
  };
  const submitQr = (event: FormEvent) => {
    event.preventDefault();
    reset();
    qr.mutate();
  };
  const submitOtp = (event: FormEvent) => {
    event.preventDefault();
    reset();
    fallback.mutate();
  };
  return (
    <>
      <PageHeader
        eyebrow="Front desk"
        title="Secure check-in"
        description="Verify a short-lived customer QR token or the in-app fallback OTP. Access is enforced for the booking branch."
      />
      <div className="detail-grid">
        <form
          className="panel stack"
          data-state={checkInViewState(
            qr.isPending,
            qr.error,
            Boolean(qr.data),
          )}
          onSubmit={submitQr}
        >
          <h2>QR scanner input</h2>
          <p className="muted">
            Paste the decoded token from your scanner. Browser camera capture is
            a later UX enhancement.
          </p>
          <label className="field">
            Decoded QR token
            <input
              aria-label="Decoded QR token"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              minLength={32}
              required
            />
          </label>
          <button disabled={qr.isPending} type="submit">
            {qr.isPending ? "Verifying…" : "Verify QR"}
          </button>
          {qr.error && (
            <div className="error-banner" role="alert">
              {checkInErrorMessage(qr.error)}
            </div>
          )}
        </form>
        <form
          className="panel stack"
          data-state={checkInViewState(
            fallback.isPending,
            fallback.error,
            Boolean(fallback.data),
          )}
          onSubmit={submitOtp}
        >
          <h2>Fallback OTP</h2>
          <label className="field">
            Booking ID
            <input
              aria-label="Booking ID"
              value={bookingId}
              onChange={(event) => setBookingId(event.target.value)}
              required
            />
          </label>
          <label className="field">
            Six-digit OTP
            <input
              aria-label="Six-digit OTP"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              pattern="\d{6}"
              required
            />
          </label>
          <button disabled={fallback.isPending} type="submit">
            {fallback.isPending ? "Verifying…" : "Verify OTP"}
          </button>
          {fallback.error && (
            <div className="error-banner" role="alert">
              {checkInErrorMessage(fallback.error)}
            </div>
          )}
        </form>
      </div>
      {result && <Verified result={result} />}
    </>
  );
}
