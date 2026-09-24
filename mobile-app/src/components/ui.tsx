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
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage } from "../utils/domain";
export const palette = {
  ink: "#18251F",
  accent: "#147558",
  accentDark: "#0A5540",
  accentSoft: "#E4F3EC",
  lime: "#C8EF62",
  canvas: "#F5F5EF",
  surface: "#FFFDF8",
  muted: "#607168",
  border: "#DEE4DC",
  danger: "#A83D38",
  warning: "#9B6811",
};
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
    </SafeAreaView>
  );
}
export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.sectionTitle}>
      {children}
    </Text>
  );
}
export function Copy({ children }: { children: React.ReactNode }) {
  return <Text style={styles.copy}>{children}</Text>;
}
export function Card({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "highlight" | "dark";
}) {
  return (
    <View
      style={[
        styles.card,
        tone === "highlight" && styles.cardHighlight,
        tone === "dark" && styles.cardDark,
      ]}
    >
      {children}
    </View>
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
  image,
  onPress,
}: {
  name: string;
  meta: string;
  detail?: string;
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
      <Image source={image} style={styles.gymCardImage} />
      <View style={styles.gymCardBody}>
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
        <Text style={styles.gymCardLink}>View gym →</Text>
      </View>
    </Pressable>
  );
}
export function Button({
  label,
  onPress,
  disabled = false,
  variant,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
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
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${resolvedVariant}`],
        pressed && styles.buttonPressed,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          resolvedVariant !== "primary" && styles.buttonSecondaryText,
          resolvedVariant === "danger" && styles.buttonDangerText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Input({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View>
      <Text style={styles.inputLabel}>{label}</Text>
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
      <View accessibilityLabel="Loading" style={styles.stateCard}>
        <ActivityIndicator color={palette.accent} />
        <Text style={styles.stateTitle}>Getting things ready…</Text>
      </View>
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
      <View style={styles.emptyCard}>
        <Text style={styles.emptyIcon}>◇</Text>
        <Text style={styles.stateTitle}>Nothing here yet</Text>
        <Copy>Try another date, search, or filter.</Copy>
      </View>
    );
  return null;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 14,
  },
  title: {
    fontSize: 31,
    lineHeight: 36,
    letterSpacing: -0.8,
    fontWeight: "800",
    color: palette.ink,
  },
  sectionTitle: {
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.35,
    fontWeight: "800",
    color: palette.ink,
    marginTop: 8,
  },
  copy: { fontSize: 15, color: palette.muted, lineHeight: 22 },
  card: {
    padding: 18,
    backgroundColor: palette.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 11,
    marginBottom: 6,
    shadowColor: "#173328",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 2,
  },
  cardHighlight: {
    backgroundColor: palette.accentSoft,
    borderColor: "#C9E1D5",
  },
  cardDark: { backgroundColor: palette.ink, borderColor: palette.ink },
  button: {
    minHeight: 50,
    borderRadius: 14,
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
    minHeight: 142,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 22,
    overflow: "hidden",
    marginBottom: 12,
    shadowColor: "#173328",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 2,
  },
  gymCardImage: {
    width: 132,
    alignSelf: "stretch",
    backgroundColor: palette.accentSoft,
  },
  gymCardBody: { flex: 1, padding: 14, gap: 5, justifyContent: "center" },
  gymCardTitle: {
    color: palette.ink,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.25,
  },
  gymCardMeta: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  gymCardDetail: {
    color: palette.warning,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  gymCardLink: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
});
