"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, PageHeader, PageState, StatusBadge } from "@gymride/web-ui";
import type { GymBranch, GymSummary, PageMeta, PaginatedResponse } from "@gymride/types";
import { api } from "@/lib/api";
import { partnerReviewParams } from "@/lib/review-filters";

interface PartnerReview {
  id: string; bookingId: string; gymId: string; branchId: string; rating: number;
  title: string | null; comment: string | null; status: string; reviewerName: string;
  createdAt: string; editedAt: string | null;
}
interface ReviewResult { data: PartnerReview[]; aggregate: { averageRating: number | null; reviewCount: number }; meta: PageMeta }

export default function PartnerReviewsPage() {
  const [gymId, setGymId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [rating, setRating] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const gyms = useQuery({ queryKey: ["partner-gyms", "review-filter"], queryFn: () => api.request<PaginatedResponse<GymSummary>>("/partner/gyms?page=1&limit=100") });
  const branches = useQuery({ queryKey: ["partner-review-branches", gymId], enabled: !!gymId, queryFn: () => api.request<GymBranch[]>(`/partner/gyms/${gymId}/branches`) });
  const params = partnerReviewParams({ page, gymId, branchId, rating, from, to });
  const reviews = useQuery({ queryKey: ["partner-reviews", params.toString()], queryFn: () => api.request<ReviewResult>(`/partner/reviews?${params}`) });
  return <>
    <PageHeader eyebrow="Customer feedback" title="Reviews" description="Read-only feedback and ratings for gyms you manage." />
    <div className="toolbar">
      <select aria-label="Gym" value={gymId} onChange={(event) => { setGymId(event.target.value); setBranchId(""); setPage(1); }}><option value="">All my gyms</option>{gyms.data?.data.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select>
      <select aria-label="Branch" value={branchId} onChange={(event) => { setBranchId(event.target.value); setPage(1); }} disabled={!gymId}><option value="">All branches</option>{branches.data?.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
      <select aria-label="Rating" value={rating} onChange={(event) => { setRating(event.target.value); setPage(1); }}><option value="">All ratings</option>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select>
      <input aria-label="From date" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
      <input aria-label="To date" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
    </div>
    {reviews.data && <p>{reviews.data.aggregate.averageRating === null ? "No published ratings" : `${reviews.data.aggregate.averageRating.toFixed(1)} / 5`} · {reviews.data.aggregate.reviewCount} published reviews</p>}
    {reviews.isLoading ? <PageState title="Loading reviews…" /> : reviews.error ? <ErrorState error={reviews.error} retry={() => void reviews.refetch()} /> : !reviews.data?.data.length ? <PageState title="No reviews found" detail="Try another gym, branch, rating or date range." /> : <>
      <div className="table-wrap"><table><thead><tr><th>Rating</th><th>Review</th><th>Gym / branch</th><th>Booking</th><th>Status</th><th>Created</th></tr></thead><tbody>{reviews.data.data.map((review) => <tr key={review.id}>
        <td>{"★".repeat(review.rating)}<br /><small>{review.reviewerName}</small></td>
        <td><strong>{review.title || "Rating only"}</strong><br />{review.comment || "No comment"}</td>
        <td>{review.gymId.slice(0,8)} / {review.branchId.slice(0,8)}</td>
        <td>{review.bookingId.slice(0,8)}</td>
        <td><StatusBadge status={review.status} /></td>
        <td>{new Date(review.createdAt).toLocaleDateString("en-IN")}</td>
      </tr>)}</tbody></table></div>
      <div className="toolbar"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={!reviews.data.meta.hasNextPage} onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
  </>;
}
