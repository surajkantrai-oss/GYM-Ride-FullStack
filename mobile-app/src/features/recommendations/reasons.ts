import type { RecommendationReason } from "@gymride/types";

export const recommendationReasonLabel: Record<RecommendationReason, string> = {
  NEAR_YOU: "Near you",
  HIGHLY_RATED: "Highly rated",
  MATCHES_AMENITIES: "Matches your amenities",
  FITS_BUDGET: "Fits your budget",
  AVAILABLE_AT_PREFERRED_TIME: "Slots available",
  FLEX_ELIGIBLE: "Flex eligible",
  PREVIOUSLY_VISITED: "Previously visited",
  POPULAR_WITH_CUSTOMERS: "Popular with customers",
};
