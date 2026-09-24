import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon, type AppIconName } from "./AppIcon";
import { colors, radius, shadows, spacing, typography } from "./theme";

export function SearchBar({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
      <AppIcon name="search" size={22} color={colors.primary} />
      <Text numberOfLines={1} style={styles.searchText}>{label}</Text>
      <View style={styles.searchDivider} />
      <AppIcon name="sliders" size={22} color={colors.primary} />
    </Pressable>
  );
}

export function QuickAction({ icon, label, onPress }: { icon: AppIconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.quick, pressed && styles.pressed]}>
      <View style={styles.quickIcon}>
        <AppIcon name={icon} size={27} color={colors.primaryPressed} filled={icon === "star" || icon === "location"} />
      </View>
      <Text numberOfLines={2} style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  searchText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  searchDivider: { width: 1, height: 30, backgroundColor: colors.border },
  quick: {
    flex: 1,
    minHeight: 104,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.card,
    backgroundColor: "rgba(255,253,248,0.96)",
    ...shadows.card,
  },
  quickIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center" },
  quickLabel: { ...typography.caption, color: colors.textPrimary, textAlign: "center" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
