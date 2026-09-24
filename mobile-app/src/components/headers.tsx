import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon, type AppIconName } from "./AppIcon";
import { colors, radius, spacing, typography } from "./theme";
import { useImageSurface } from "./ui";

type HeaderAction = {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  badge?: number;
};

export function AppHeader({
  eyebrow,
  title,
  subtitle,
  location,
  action,
  avatarLabel,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  location?: string;
  action?: HeaderAction;
  avatarLabel?: string;
}) {
  const onImage = useImageSurface();
  return (
    <View style={styles.header}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={[styles.eyebrow, onImage && styles.eyebrowOnImage]}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={[styles.title, onImage && styles.titleOnImage]} numberOfLines={2}>
          {title}
        </Text>
        {location ? (
          <View style={styles.locationRow}>
            <AppIcon name="location" size={14} color={onImage ? colors.primaryMuted : colors.primary} />
            <Text style={[styles.location, onImage && styles.secondaryOnImage]} numberOfLines={1}>{location}</Text>
          </View>
        ) : subtitle ? (
          <Text style={[styles.subtitle, onImage && styles.secondaryOnImage]} numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <AppIcon name={action.icon} size={23} color={colors.primary} />
          {action.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{Math.min(action.badge, 99)}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : avatarLabel ? (
        <View accessibilityLabel="Profile avatar" style={styles.avatar}>
          <Text style={styles.avatarText}>{avatarLabel.slice(0, 1).toUpperCase()}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <AppHeader title={title} subtitle={subtitle} />;
}

export function BackHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack: () => void;
  action?: HeaderAction;
}) {
  return (
    <View style={styles.backHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.backAction}>
        <AppIcon name="arrow-left" size={22} color={colors.textPrimary} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.backTitle} numberOfLines={1}>{title}</Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={styles.backAction}>
          <AppIcon name={action.icon} size={22} color={colors.textPrimary} />
        </Pressable>
      ) : <View style={styles.backAction} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  copy: { flex: 1, gap: 2 },
  eyebrow: {
    ...typography.caption,
    color: colors.primary,
    letterSpacing: 1.7,
    textTransform: "uppercase",
  },
  eyebrowOnImage: { color: colors.primaryMuted },
  title: { ...typography.heading2, color: colors.textPrimary },
  titleOnImage: {
    color: colors.white,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  secondaryOnImage: {
    color: "#E0EEE7",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 3 },
  location: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  action: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...typography.heading3, color: colors.white },
  badge: {
    position: "absolute",
    right: -3,
    top: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.round,
    backgroundColor: colors.lime,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 9, fontWeight: "900", color: colors.textPrimary },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  backHeader: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backTitle: { ...typography.heading3, color: colors.textPrimary, flex: 1, textAlign: "center" },
});
