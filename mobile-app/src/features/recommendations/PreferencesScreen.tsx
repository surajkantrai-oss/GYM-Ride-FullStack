import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Copy, Input, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";

export function PreferencesScreen() {
  const { api } = useSession(); const cache = useQueryClient();
  const query = useQuery({ queryKey: ["gym-preferences"], queryFn: () => api.gymPreferences() });
  const [amenities, setAmenities] = useState(""); const [radius, setRadius] = useState("10"); const [budget, setBudget] = useState("");
  useEffect(() => { if (query.data) { setAmenities(query.data.preferredAmenities.join(", ")); setRadius(String(query.data.preferredRadiusKm)); setBudget(query.data.preferredBudgetMaxMinor == null ? "" : String(query.data.preferredBudgetMaxMinor / 100)); } }, [query.data]);
  const save = useMutation({ mutationFn: () => api.updateGymPreferences({ preferredAmenities: amenities.split(",").map((item) => item.trim()).filter(Boolean), preferredRadiusKm: Number(radius), preferredBudgetMaxMinor: budget ? Math.round(Number(budget) * 100) : null }), onSuccess: async () => { await cache.invalidateQueries({ queryKey: ["gym-preferences"] }); await cache.invalidateQueries({ queryKey: ["recommendations"] }); } });
  const valid = Number.isInteger(Number(radius)) && Number(radius) >= 1 && Number(radius) <= 50 && (!budget || Number(budget) >= 0);
  return <Screen><Title>Gym preferences</Title><Copy>Optional preferences improve deterministic recommendations. Location and filters always take priority.</Copy><State loading={query.isLoading} error={query.error || save.error} retry={() => void query.refetch()} />
    <Input label="Preferred amenities (codes, comma-separated)" value={amenities} onChangeText={setAmenities} />
    <Input label="Preferred radius (1–50 km)" value={radius} onChangeText={setRadius} keyboardType="number-pad" />
    <Input label="Maximum day-pass budget (₹)" value={budget} onChangeText={setBudget} keyboardType="number-pad" />
    <Button label={save.isPending ? "Saving…" : "Save preferences"} disabled={!valid || save.isPending} onPress={() => save.mutate()} />
  </Screen>;
}
