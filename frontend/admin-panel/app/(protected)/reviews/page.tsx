"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, PageHeader, PageState, StatusBadge } from "@gymride/web-ui";
import type { PageMeta } from "@gymride/types";
import { api } from "@/lib/api";
import { adminReviewParams, canSubmitModeration } from "@/lib/review-filters";

type ReviewStatus = "PUBLISHED" | "HIDDEN" | "REMOVED";
interface AdminReview {
  id: string; bookingId: string; gymId: string; branchId: string; rating: number;
  title: string | null; comment: string | null; status: ReviewStatus; createdAt: string;
  gym: { name: string }; branch: { name: string }; customer: { firstName: string | null };
}
interface ReviewResult { data: AdminReview[]; meta: PageMeta }

export default function AdminReviewsPage() {
  const cache = useQueryClient();
  const [status, setStatus] = useState("");
  const [rating, setRating] = useState("");
  const [gymId, setGymId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<{ id: string; status: ReviewStatus } | null>(null);
  const [reason, setReason] = useState("");
  const params = adminReviewParams({ page, status, rating, gymId, branchId, search });
  const reviews = useQuery({ queryKey: ["admin-reviews", params.toString()], queryFn: () => api.request<ReviewResult>(`/admin/reviews?${params}`) });
  const moderate = useMutation({ mutationFn: () => api.request(`/admin/reviews/${target?.id}/moderation`, { method: "PATCH", body: JSON.stringify({ status: target?.status, reason: reason.trim() }) }), onSuccess: async () => { setTarget(null); setReason(""); await cache.invalidateQueries({ queryKey: ["admin-reviews"] }); } });
  return <>
    <PageHeader eyebrow="Trust and safety" title="Review moderation" description="Inspect customer feedback, hide or restore with an audited reason. Original text is never rewritten." />
    <div className="toolbar">
      <select aria-label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{["PUBLISHED","HIDDEN","REMOVED"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
      <select aria-label="Rating" value={rating} onChange={(event) => { setRating(event.target.value); setPage(1); }}><option value="">All ratings</option>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select>
      <input aria-label="Gym ID" placeholder="Gym ID" value={gymId} onChange={(event) => { setGymId(event.target.value); setPage(1); }} />
      <input aria-label="Branch ID" placeholder="Branch ID" value={branchId} onChange={(event) => { setBranchId(event.target.value); setPage(1); }} />
      <input aria-label="Search review" placeholder="Title or comment" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
    </div>
    {reviews.isLoading ? <PageState title="Loading reviews…" /> : reviews.error ? <ErrorState error={reviews.error} retry={() => void reviews.refetch()} /> : !reviews.data?.data.length ? <PageState title="No reviews found" /> : <>
      <div className="table-wrap"><table><thead><tr><th>Rating</th><th>Original review</th><th>Gym / branch</th><th>Booking</th><th>Status</th><th>Action</th></tr></thead><tbody>{reviews.data.data.map((review) => <tr key={review.id}>
        <td>{"★".repeat(review.rating)}<br /><small>{review.customer.firstName || "Member"}</small></td>
        <td><strong>{review.title || "Rating only"}</strong><br />{review.comment || "No comment"}</td>
        <td>{review.gym.name}<br /><small>{review.branch.name}</small></td>
        <td>{review.bookingId.slice(0,8)}</td>
        <td><StatusBadge status={review.status} /></td>
        <td>{review.status !== "PUBLISHED" && <button onClick={() => setTarget({ id: review.id, status: "PUBLISHED" })}>Restore</button>} {review.status !== "HIDDEN" && <button onClick={() => setTarget({ id: review.id, status: "HIDDEN" })}>Hide</button>} {review.status !== "REMOVED" && <button onClick={() => setTarget({ id: review.id, status: "REMOVED" })}>Remove</button>}</td>
      </tr>)}</tbody></table></div>
      <div className="toolbar"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={!reviews.data.meta.hasNextPage} onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
    {target && <section className="card"><h2>{target.status.toLowerCase()} review</h2><p>Reason is required and recorded in the audit log.</p><input aria-label="Moderation reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />{moderate.error && <ErrorState error={moderate.error} />}<button disabled={!canSubmitModeration(reason, moderate.isPending)} onClick={() => moderate.mutate()}>Confirm moderation</button><button onClick={() => { setTarget(null); setReason(""); }}>Cancel</button></section>}
  </>;
}
