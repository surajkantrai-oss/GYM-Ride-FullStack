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

export function gymVisual(key: string): ImageSourcePropType {
  const total = [...key].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return visuals[total % visuals.length]!;
}

export const heroVisual = visuals[0]!;
