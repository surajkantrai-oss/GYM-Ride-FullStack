export interface PartnerReviewFilters {
  page: number;
  gymId: string;
  branchId: string;
  rating: string;
  from: string;
  to: string;
}

export function partnerReviewParams(filters: PartnerReviewFilters): URLSearchParams {
  return new URLSearchParams({
    page: String(filters.page), limit: "20",
    ...(filters.gymId && { gymId: filters.gymId }),
    ...(filters.branchId && { branchId: filters.branchId }),
    ...(filters.rating && { rating: filters.rating }),
    ...(filters.from && { from: `${filters.from}T00:00:00.000Z` }),
    ...(filters.to && { to: `${filters.to}T23:59:59.999Z` }),
  });
}
