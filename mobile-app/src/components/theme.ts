import type { TextStyle, ViewStyle } from "react-native";

export const colors = {
  background: "#F6F5EF",
  surface: "#FFFDF8",
  surfaceElevated: "#FFFFFF",
  primary: "#147558",
  primaryPressed: "#0A5540",
  primaryMuted: "#DFF1E9",
  lime: "#C8EF62",
  textPrimary: "#17251F",
  textSecondary: "#5E7067",
  textMuted: "#849188",
  border: "#DCE4DD",
  success: "#147558",
  warning: "#98620B",
  error: "#AA403A",
  white: "#FFFFFF",
  overlay: "rgba(6, 27, 20, 0.46)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
} as const;

export const radius = {
  input: 20,
  button: 26,
  card: 26,
  largeCard: 36,
  round: 999,
} as const;

export const typography = {
  display: {
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1.1,
    fontWeight: "900",
  } satisfies TextStyle,
  heading1: {
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.75,
    fontWeight: "900",
  } satisfies TextStyle,
  heading2: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    fontWeight: "800",
  } satisfies TextStyle,
  heading3: {
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.2,
    fontWeight: "800",
  } satisfies TextStyle,
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" } satisfies TextStyle,
  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
  } satisfies TextStyle,
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  } satisfies TextStyle,
  caption: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  } satisfies TextStyle,
} as const;

export const shadows = {
  card: {
    shadowColor: "#173328",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 2,
  } satisfies ViewStyle,
  elevated: {
    shadowColor: "#102A20",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 5,
  } satisfies ViewStyle,
  bottomNavigation: {
    shadowColor: "#102A20",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  } satisfies ViewStyle,
} as const;

export const palette = {
  ink: colors.textPrimary,
  accent: colors.primary,
  accentDark: colors.primaryPressed,
  accentSoft: colors.primaryMuted,
  lime: colors.lime,
  canvas: colors.background,
  surface: colors.surface,
  muted: colors.textSecondary,
  border: colors.border,
  danger: colors.error,
  warning: colors.warning,
} as const;
