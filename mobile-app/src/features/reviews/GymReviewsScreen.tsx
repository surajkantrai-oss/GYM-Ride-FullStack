import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import { Button, Card, Copy, Screen, SectionTitle, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";

export function GymReviewsScreen({ route }: NativeStackScreenProps<RootStack, "GymReviews">) {
  const { api } = useSession();
  const [page, setPage] = useState(1);
  const { gymId, branchId } = route.params;
  const query = useQuery({ queryKey: ["gym-reviews", gymId, branchId, page], queryFn: () => api.gymReviews(gymId, page, branchId) });
  return <Screen>
    <Title>Customer reviews</Title>
    <State loading={query.isLoading} error={query.error} empty={query.data?.aggregate.reviewCount === 0} retry={() => void query.refetch()} />
    {query.data && <>
      <Copy>{query.data.aggregate.averageRating === null ? "No ratings yet" : `${query.data.aggregate.averageRating.toFixed(1)} / 5` } · {query.data.aggregate.reviewCount} review{query.data.aggregate.reviewCount === 1 ? "" : "s"}</Copy>
      {query.data.data.map((review) => <Card key={review.id}>
        <Copy>{"★".repeat(review.rating)} · {review.reviewerName}</Copy>
        {review.title && <SectionTitle>{review.title}</SectionTitle>}
        {review.comment && <Copy>{review.comment}</Copy>}
        <Copy>{new Date(review.createdAt).toLocaleDateString()}</Copy>
      </Card>)}
      {page > 1 && <Button label="Previous reviews" onPress={() => setPage(page - 1)} />}
      {query.data.meta.hasNextPage && <Button label="More reviews" onPress={() => setPage(page + 1)} />}
    </>}
  </Screen>;
}
