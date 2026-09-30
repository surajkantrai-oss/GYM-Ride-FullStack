"use client";

import type {
  GymOsMembership,
  GymOsMembershipExpirySummary,
  GymSummary,
  PaginatedResponse,
} from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
  pushToast,
  useAuth,
} from "@gymride/web-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";

export default function MembershipsPage() {
  const cache = useQueryClient();
  const { user } = useAuth();
  const [gymId, setGymId] = useState("");
  const [status, setStatus] = useState("");
  const [expiryBucket, setExpiryBucket] = useState("");
  const canWrite = !!user?.roles.some(
    (role) => role === "GYM_OWNER" || role === "GYM_MANAGER",
  );
  const gyms = useQuery({
    queryKey: ["membership-gyms"],
    queryFn: () =>
      api.request<PaginatedResponse<GymSummary>>(
        "/partner/gyms?page=1&limit=100",
      ),
  });
  const selectedGym = gymId || gyms.data?.data[0]?.id || "";
  const summary = useQuery({
    queryKey: ["membership-expiry", selectedGym],
    enabled: !!selectedGym,
    queryFn: () =>
      api.request<GymOsMembershipExpirySummary>(
        `/partner/gyms/${selectedGym}/gym-os/memberships/expiry-summary`,
      ),
  });
  const memberships = useQuery({
    queryKey: ["memberships", selectedGym, status, expiryBucket],
    enabled: !!selectedGym,
    queryFn: () =>
      api.request<PaginatedResponse<GymOsMembership>>(
        `/partner/gyms/${selectedGym}/gym-os/memberships?page=1&pageSize=100${status ? `&status=${status}` : ""}${expiryBucket ? `&expiryBucket=${expiryBucket}` : ""}`,
      ),
  });
  const action = useMutation({
    mutationFn: ({
      membership,
      operation,
    }: {
      membership: GymOsMembership;
      operation: string;
    }) => {
      const reason =
        operation === "freeze" || operation === "cancel"
          ? window.prompt(`Reason to ${operation} this membership`)
          : undefined;
      if ((operation === "freeze" || operation === "cancel") && !reason)
        throw new Error("A reason is required");
      const body =
        operation === "renew"
          ? { planId: membership.membershipPlanId }
          : reason
            ? { reason }
            : {};
      return api.request(
        `/partner/gyms/${selectedGym}/gym-os/memberships/${membership.id}/${operation}`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    onSuccess: async () => {
      pushToast("Membership updated", "The lifecycle action was recorded.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["memberships"] }),
        cache.invalidateQueries({ queryKey: ["membership-expiry"] }),
      ]);
    },
  });
  const metrics = summary.data
    ? [
        ["Expired", summary.data.expired, "EXPIRED"],
        ["Ends today", summary.data.today, "TODAY"],
        ["Tomorrow", summary.data.in1Day, "IN_1_DAY"],
        ["In 2 days", summary.data.in2Days, "IN_2_DAYS"],
        ["In 3 days", summary.data.in3Days, "IN_3_DAYS"],
        ["Within 7 days", summary.data.within7Days, "WITHIN_7_DAYS"],
        ["This month", summary.data.thisMonth, "THIS_MONTH"],
      ]
    : [];
  return (
    <>
      <PageHeader
        eyebrow="GymOS · lifecycle"
        title="Memberships & expiries"
        description="Track active, scheduled, frozen and ended memberships with timezone-aware expiry windows."
      />
      <section className="metric-grid">
        {metrics.map(([label, value, bucket]) => (
          <button
            className="metric-card"
            key={label}
            onClick={() => setExpiryBucket(String(bucket))}
          >
            <span>{label}</span>
            <strong>{value}</strong>
          </button>
        ))}
      </section>
      <section className="panel filter-row">
        <select value={selectedGym} onChange={(e) => setGymId(e.target.value)}>
          {(gyms.data?.data || []).map((gym) => (
            <option value={gym.id} key={gym.id}>
              {gym.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["SCHEDULED", "ACTIVE", "FROZEN", "EXPIRED", "CANCELLED"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
        <select
          value={expiryBucket}
          onChange={(e) => setExpiryBucket(e.target.value)}
        >
          <option value="">All expiry dates</option>
          <option value="TODAY">Today</option>
          <option value="IN_1_DAY">In 1 day</option>
          <option value="IN_2_DAYS">In 2 days</option>
          <option value="IN_3_DAYS">In 3 days</option>
          <option value="WITHIN_7_DAYS">Within 7 days</option>
          <option value="THIS_MONTH">This month</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </section>
      {memberships.isLoading ? (
        <PageState title="Loading memberships…" />
      ) : memberships.error ? (
        <ErrorState error={memberships.error} />
      ) : !memberships.data?.data.length ? (
        <PageState title="No memberships found" />
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Phone</th>
                <th>Plan</th>
                <th>Period</th>
                <th>Days left</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {memberships.data.data.map((membership) => (
                <tr key={membership.id}>
                  <td>
                    <b>
                      {membership.member?.firstName}{" "}
                      {membership.member?.lastName}
                    </b>
                    <br />
                    <small>{membership.member?.memberCode}</small>
                  </td>
                  <td>{membership.member?.phone}</td>
                  <td>{membership.planNameSnapshot}</td>
                  <td>
                    {new Date(membership.startDate).toLocaleDateString("en-IN")}{" "}
                    – {new Date(membership.endDate).toLocaleDateString("en-IN")}
                  </td>
                  <td>{membership.daysRemaining}</td>
                  <td>
                    <StatusBadge status={membership.status} />
                  </td>
                  <td>
                    {canWrite && (
                      <div className="button-row">
                        {membership.status === "ACTIVE" && (
                          <button
                            className="secondary"
                            onClick={() =>
                              action.mutate({ membership, operation: "freeze" })
                            }
                          >
                            Freeze
                          </button>
                        )}
                        {membership.status === "FROZEN" && (
                          <button
                            onClick={() =>
                              action.mutate({ membership, operation: "resume" })
                            }
                          >
                            Resume
                          </button>
                        )}
                        {membership.status !== "CANCELLED" && (
                          <button
                            onClick={() =>
                              action.mutate({ membership, operation: "renew" })
                            }
                          >
                            Renew
                          </button>
                        )}
                        {["ACTIVE", "FROZEN", "SCHEDULED"].includes(
                          membership.status,
                        ) && (
                          <button
                            className="secondary"
                            onClick={() =>
                              action.mutate({ membership, operation: "cancel" })
                            }
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
