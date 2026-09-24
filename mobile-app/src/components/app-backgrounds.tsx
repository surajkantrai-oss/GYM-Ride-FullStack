import type { ReactNode } from "react";
import { ImageBackground, StyleSheet, Text, View } from "react-native";
import { AppIcon } from "./AppIcon";
import { colors, radius, spacing } from "./theme";

// Static React Native assets require Metro's compile-time require form.
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const gymBackground = require("../../assets/brand/gym-background.png");

export function BrandLockup({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  const foreground = light ? colors.white : colors.textPrimary;
  return (
    <View accessibilityLabel="GYMRide. Find. Fit. Belong." style={[styles.brand, compact && styles.brandCompact]}>
      <View style={[styles.brandMark, compact && styles.brandMarkCompact, light && styles.brandMarkLight]}>
        <AppIcon name="dumbbell" size={compact ? 25 : 35} color={light ? colors.primaryMuted : colors.primary} filled />
      </View>
      <Text style={[styles.brandName, compact && styles.brandNameCompact, { color: foreground }]}>GYMRide</Text>
      <Text style={[styles.brandLine, compact && styles.brandLineCompact, { color: light ? "#E5F5ED" : colors.textSecondary }]}>Find. Fit. Belong.</Text>
    </View>
  );
}

export function GymBackground({ children, overlay = 0.54 }: { children: ReactNode; overlay?: number }) {
  return (
    <ImageBackground source={gymBackground} resizeMode="cover" style={styles.background}>
      <View pointerEvents="none" style={[styles.overlay, { backgroundColor: `rgba(5, 20, 15, ${overlay})` }]} />
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: colors.textPrimary },
  overlay: { ...StyleSheet.absoluteFill },
  brand: { alignItems: "center", gap: 1 },
  brandCompact: { gap: 0 },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(20,117,88,0.25)",
    backgroundColor: "rgba(255,253,248,0.82)",
    marginBottom: spacing.xs,
  },
  brandMarkCompact: { width: 52, height: 52, marginBottom: 2 },
  brandMarkLight: { backgroundColor: "rgba(7,45,33,0.48)", borderColor: "rgba(206,244,226,0.55)" },
  brandName: { fontSize: 34, lineHeight: 38, fontWeight: "900", letterSpacing: -1.1 },
  brandNameCompact: { fontSize: 27, lineHeight: 30 },
  brandLine: { fontSize: 12, lineHeight: 17, fontWeight: "600", letterSpacing: 3 },
  brandLineCompact: { fontSize: 10, lineHeight: 14, letterSpacing: 2.2 },
});
