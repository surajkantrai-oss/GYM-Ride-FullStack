import type { ImageSourcePropType } from "react-native";

const visuals: ImageSourcePropType[] = [
  // Static React Native assets require Metro's compile-time require form.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../../assets/gyms/gym-warm.jpg"),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../../assets/gyms/gym-strength.jpg"),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../../assets/gyms/gym-airy.jpg"),
];

export function gymVisual(key: string, imageId?: string): ImageSourcePropType {
  if (imageId && process.env.EXPO_PUBLIC_API_BASE_URL)
    return {
      uri: `${process.env.EXPO_PUBLIC_API_BASE_URL}/media/gym-images/${imageId}`,
    };
  const total = [...key].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return visuals[total % visuals.length]!;
}

export const heroVisual = visuals[0]!;
export const onboardingVisuals = [
  visuals[2]!,
  visuals[1]!,
  visuals[0]!,
] as const;
