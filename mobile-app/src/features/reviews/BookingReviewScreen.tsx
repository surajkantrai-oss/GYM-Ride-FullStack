import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import { Button, Copy, Input, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";

export function BookingReviewScreen({ route }: NativeStackScreenProps<RootStack, "BookingReview">) {
  const { api } = useSession();
  const cache = useQueryClient();
  const { bookingId } = route.params;
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const booking = useQuery({ queryKey: ["booking", bookingId], queryFn: () => api.booking(bookingId) });
  useEffect(() => {
    if (booking.data?.review) {
      setRating(booking.data.review.rating);
      setTitle(booking.data.review.title || "");
      setComment(booking.data.review.comment || "");
    }
  }, [booking.data?.review?.id]);
  const save = useMutation({
    mutationFn: () => {
      const input = { rating, ...(title.trim() && { title: title.trim() }), ...(comment.trim() && { comment: comment.trim() }) };
      return booking.data?.review ? api.editReview(bookingId, input) : api.createReview(bookingId, input);
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["booking", bookingId] });
      await cache.invalidateQueries({ queryKey: ["gym-reviews", booking.data?.gymId] });
      await cache.invalidateQueries({ queryKey: ["gym", booking.data?.gymId] });
    },
  });
  const review = booking.data?.review;
  const eligible = booking.data?.status === "COMPLETED";
  return <Screen>
    <Title>{review ? "Your review" : "Review your visit"}</Title>
    <State loading={booking.isLoading} error={booking.error || save.error} retry={() => void booking.refetch()} />
    {booking.data && <>
      <Copy>{booking.data.gym.name} · {booking.data.branch.name}</Copy>
      {!eligible && <Copy>Reviews are available only after a completed visit.</Copy>}
      {review?.status === "HIDDEN" && <Copy>This review is currently hidden from public view.</Copy>}
      {review?.status === "REMOVED" && <Copy>This review was removed and cannot be edited.</Copy>}
      {eligible && review?.status !== "REMOVED" && <>
        <Copy>Choose a rating from 1 to 5 stars.</Copy>
        {[1, 2, 3, 4, 5].map((value) => <Button key={value} label={`${value} star${value === 1 ? "" : "s"}${rating === value ? " selected" : ""}`} onPress={() => setRating(value)} />)}
        <Input label="Review title (optional)" value={title} onChangeText={setTitle} maxLength={120} />
        <Input label="Your review (optional)" value={comment} onChangeText={setComment} maxLength={2000} multiline />
        <Button label={review ? "Save review" : "Submit review"} disabled={save.isPending || rating < 1 || rating > 5} onPress={() => save.mutate()} />
        {save.isSuccess && <Copy>Review saved. Thank you for sharing your experience.</Copy>}
      </>}
    </>}
  </Screen>;
}
