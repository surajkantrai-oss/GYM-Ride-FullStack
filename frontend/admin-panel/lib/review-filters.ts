export interface AdminReviewFilters {
  page: number;
  status: string;
  rating: string;
  gymId: string;
  branchId: string;
  search: string;
}

export function adminReviewParams(filters: AdminReviewFilters): URLSearchParams {
  return new URLSearchParams({
    page: String(filters.page), limit: "20",
    ...(filters.status && { status: filters.status }),
    ...(filters.rating && { rating: filters.rating }),
    ...(filters.gymId && { gymId: filters.gymId }),
    ...(filters.branchId && { branchId: filters.branchId }),
    ...(filters.search && { search: filters.search }),
  });
}

export function canSubmitModeration(reason: string, pending: boolean): boolean {
  return reason.trim().length >= 3 && !pending;
}
