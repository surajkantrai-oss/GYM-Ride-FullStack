import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ImageSourcePropType,
} from "react-native";
import { createContext, useContext } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage } from "../utils/domain";
import { colors, palette, radius, shadows, spacing, typography } from "./theme";
import { AppIcon } from "./AppIcon";
export { palette } from "./theme";
const ImageSurfaceContext = createContext(false);

export function useImageSurface() {
  return useContext(ImageSurfaceContext);
}

export function Screen({
  children,
  scroll = true,
  top = false,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  top?: boolean;
}) {
  return (
    <SafeAreaView
      edges={
        top ? ["top", "bottom", "left", "right"] : ["bottom", "left", "right"]
      }
      style={styles.screen}
    >
      <ImageSurfaceContext.Provider value>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, { flex: 1 }]}>{children}</View>
        )}
      </ImageSurfaceContext.Provider>
    </SafeAreaView>
  );
}
export function Title({ children }: { children: React.ReactNode }) {
  const onImage = useImageSurface();
  return (
    <Text accessibilityRole="header" style={[styles.title, onImage && styles.titleOnImage]}>
      {children}
    </Text>
  );
}
export function SectionTitle({ children }: { children: React.ReactNode }) {
  const onImage = useImageSurface();
  return (
    <Text accessibilityRole="header" style={[styles.sectionTitle, onImage && styles.titleOnImage]}>
      {children}
    </Text>
  );
}
export function Copy({ children }: { children: React.ReactNode }) {
  const onImage = useImageSurface();
  return <Text style={[styles.copy, onImage && styles.copyOnImage]}>{children}</Text>;
}
export function Card({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "highlight" | "dark";
}) {
  return (
    <ImageSurfaceContext.Provider value={false}>
      <View
        style={[
          styles.card,
          tone === "highlight" && styles.cardHighlight,
          tone === "dark" && styles.cardDark,
        ]}
      >
        {children}
      </View>
    </ImageSurfaceContext.Provider>
  );
}
export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text
        style={[
          styles.badgeText,
          tone === "success" && styles.badgeSuccessText,
          tone === "warning" && styles.badgeWarningText,
          tone === "danger" && styles.badgeDangerText,
        ]}
      >
        {label.replaceAll("_", " ")}
      </Text>
    </View>
  );
}
export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function GymCard({
  name,
  meta,
  detail,
  status,
  price,
  tag,
  amenities,
  rating,
  reviewCount,
  image,
  onPress,
}: {
  name: string;
  meta: string;
  detail?: string;
  status?: string;
  price?: string;
  tag?: string;
  amenities?: string[];
  rating?: number | null;
  reviewCount?: number;
  image: ImageSourcePropType;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.gymCard, pressed && styles.buttonPressed]}
    >
      <View style={styles.gymCardVisual}>
        <Image source={image} resizeMode="cover" style={styles.gymCardImage} />
      </View>
      <View style={styles.gymCardBody}>
        {tag ? (
          <View style={styles.gymCardTopRow}>
            <View style={styles.gymCardTag}>
              <AppIcon name="spark" size={11} color={colors.primaryPressed} filled />
              <Text numberOfLines={1} style={styles.gymCardTagText}>{tag}</Text>
            </View>
            <View style={styles.gymCardHeart}><AppIcon name="heart" size={20} color={colors.textSecondary} /></View>
          </View>
        ) : null}
        <Text numberOfLines={2} style={styles.gymCardTitle}>
          {name}
        </Text>
        <Text numberOfLines={2} style={styles.gymCardMeta}>
          {meta}
        </Text>
        {detail ? (
          <Text numberOfLines={2} style={styles.gymCardDetail}>
            {detail}
          </Text>
        ) : null}
        {amenities?.length ? (
          <View style={styles.gymCardAmenities}>
            {amenities.slice(0, 3).map((amenity) => (
              <View key={amenity} style={styles.gymCardAmenity}><Text numberOfLines={1} style={styles.gymCardAmenityText}>{amenity}</Text></View>
            ))}
          </View>
        ) : null}
        <View style={styles.gymCardFooter}>
          <View style={styles.gymCardFooterCopy}>
            {status ? <Text numberOfLines={1} style={styles.gymCardStatus}>{status}</Text> : null}
            {rating != null ? <Text numberOfLines={1} style={styles.gymCardRating}>★ {rating.toFixed(1)}{reviewCount != null ? <Text style={styles.gymCardReviews}> ({reviewCount} reviews)</Text> : null}</Text> : null}
            {price ? <Text numberOfLines={1} style={styles.gymCardPrice}>{price}</Text> : null}
          </View>
          <View style={styles.gymCardLinkButton}><Text style={styles.gymCardLink}>View  →</Text></View>
        </View>
      </View>
    </Pressable>
  );
}
export function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const resolvedVariant =
    variant ??
    (/^(View|Refresh|More|Previous|Change|Use |Find |Recommendation)/.test(
      label,
    )
      ? "secondary"
      : "primary");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${resolvedVariant}`],
        pressed && styles.buttonPressed,
        (disabled || loading) && { opacity: 0.48 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={resolvedVariant === "primary" ? colors.white : colors.primary} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            resolvedVariant !== "primary" && styles.buttonSecondaryText,
            resolvedVariant === "danger" && styles.buttonDangerText,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
export function Input({ label, ...props }: TextInputProps & { label: string }) {
  const onImage = useImageSurface();
  return (
    <View>
      <Text style={[styles.inputLabel, onImage && styles.inputLabelOnImage]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}
export function State({
  loading,
  error,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  retry?: () => void;
}) {
  if (loading)
    return (
      <ImageSurfaceContext.Provider value={false}>
        <View accessibilityLabel="Loading" style={styles.stateCard}>
          <ActivityIndicator color={palette.accent} />
          <Text style={styles.stateTitle}>Getting things ready…</Text>
        </View>
      </ImageSurfaceContext.Provider>
    );
  if (error)
    return (
      <Card>
        <Text accessibilityRole="alert" style={{ color: palette.danger }}>
          {errorMessage(error)}
        </Text>
        {retry && <Button label="Try again" onPress={retry} />}
      </Card>
    );
  if (empty)
    return (
      <ImageSurfaceContext.Provider value={false}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>◇</Text>
          <Text style={styles.stateTitle}>Nothing here yet</Text>
          <Copy>Try another date, search, or filter.</Copy>
        </View>
      </ImageSurfaceContext.Provider>
    );
  return null;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing["3xl"],
    gap: spacing.md,
  },
  title: {
    ...typography.heading1,
    color: palette.ink,
  },
  titleOnImage: {
    color: colors.white,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  sectionTitle: {
    ...typography.heading2,
    color: palette.ink,
    marginTop: 8,
  },
  copy: { ...typography.bodySmall, color: palette.muted },
  copyOnImage: {
    color: "#E0EEE7",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  card: {
    padding: 18,
    backgroundColor: palette.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 11,
    marginBottom: 6,
    ...shadows.card,
  },
  cardHighlight: {
    backgroundColor: palette.accentSoft,
    borderColor: "#C9E1D5",
  },
  cardDark: { backgroundColor: palette.ink, borderColor: palette.ink },
  button: {
    minHeight: 56,
    borderRadius: radius.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 2,
    borderWidth: 1,
  },
  button_primary: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  button_secondary: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
  },
  button_ghost: { backgroundColor: "transparent", borderColor: "transparent" },
  button_danger: { backgroundColor: "#FFF0ED", borderColor: "#F0D0CA" },
  buttonPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  buttonText: {
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  buttonSecondaryText: { color: palette.ink },
  buttonDangerText: { color: palette.danger },
  inputLabel: {
    fontSize: 13,
    color: palette.ink,
    fontWeight: "700",
    marginBottom: 7,
  },
  inputLabelOnImage: {
    color: colors.white,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.ink,
  },
  stateCard: {
    minHeight: 110,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 22,
  },
  emptyCard: {
    minHeight: 150,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,253,248,0.75)",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.border,
    borderRadius: 22,
  },
  emptyIcon: { fontSize: 30, color: palette.accent },
  stateTitle: { fontSize: 16, color: palette.ink, fontWeight: "700" },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: "#E9ECE8",
  },
  badge_success: { backgroundColor: "#DCF3E7" },
  badge_warning: { backgroundColor: "#FFF0C9" },
  badge_danger: { backgroundColor: "#FDE4DF" },
  badge_neutral: {},
  badgeText: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "800",
    color: palette.muted,
  },
  badgeSuccessText: { color: palette.accentDark },
  badgeWarningText: { color: palette.warning },
  badgeDangerText: { color: palette.danger },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: "center",
  },
  chipSelected: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  chipText: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  chipTextSelected: { color: "#FFFFFF" },
  gymCard: {
    flexDirection: "row",
    minHeight: 144,
    alignItems: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.card,
    overflow: "hidden",
    marginBottom: 12,
    ...shadows.card,
  },
  gymCardVisual: {
    width: 124,
    aspectRatio: 0.88,
    alignSelf: "center",
    marginLeft: 8,
    borderRadius: 17,
    overflow: "hidden",
    backgroundColor: palette.accentSoft,
  },
  gymCardImage: {
    width: "100%",
    height: "100%",
    backgroundColor: palette.accentSoft,
  },
  gymCardBody: { flex: 1, minHeight: 144, padding: 14, gap: 5, justifyContent: "center" },
  gymCardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  gymCardTag: { maxWidth: "82%", flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radius.round, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.primaryMuted },
  gymCardTagText: { color: colors.primaryPressed, fontSize: 10, lineHeight: 13, fontWeight: "800" },
  gymCardHeart: { width: 30, height: 30, marginTop: -5, marginRight: -5, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(246,245,239,0.92)" },
  gymCardTitle: {
    color: palette.ink,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.25,
  },
  gymCardMeta: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  gymCardDetail: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  gymCardAmenities: { flexDirection: "row", flexWrap: "nowrap", gap: 4 },
  gymCardAmenity: { maxWidth: 78, borderRadius: radius.round, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: colors.background },
  gymCardAmenityText: { color: colors.textSecondary, fontSize: 9, lineHeight: 12, fontWeight: "700" },
  gymCardFooter: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginTop: 2 },
  gymCardFooterCopy: { flex: 1, gap: 1 },
  gymCardStatus: { color: palette.accent, fontSize: 11, lineHeight: 15, fontWeight: "800" },
  gymCardPrice: { color: palette.ink, fontSize: 13, lineHeight: 17, fontWeight: "900" },
  gymCardRating: { color: colors.primaryPressed, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  gymCardReviews: { color: colors.textSecondary, fontWeight: "500" },
  gymCardLinkButton: { borderRadius: radius.round, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8 },
  gymCardLink: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
});
