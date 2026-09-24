import { forwardRef, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { AppIcon } from "./AppIcon";
import { colors, radius, spacing, typography } from "./theme";

export const PhoneInput = forwardRef<
  TextInput,
  {
    countryCode: string;
    number: string;
    onCountryCodeChange: (value: string) => void;
    onNumberChange: (value: string) => void;
    error?: boolean;
  }
>(function PhoneInput(
  { countryCode, number, onCountryCodeChange, onNumberChange, error = false },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text style={styles.label}>Mobile number</Text>
      <View style={[styles.phoneShell, focused && styles.focused, error && styles.error]}>
        <View style={styles.codeGroup}>
          {countryCode === "+91" ? (
            <View accessibilityLabel="India" style={styles.indiaFlag}>
              <View style={styles.flagSaffron} />
              <View style={styles.flagWhite}><View style={styles.flagWheel} /></View>
              <View style={styles.flagGreen} />
            </View>
          ) : (
            <View accessibilityLabel="International calling code" style={styles.globe}>
              <AppIcon name="globe" size={19} color={colors.primary} />
            </View>
          )}
          <TextInput
            accessibilityLabel="Country calling code"
            value={countryCode}
            onChangeText={(value) => onCountryCodeChange(`+${value.replace(/\D/g, "").slice(0, 4)}`)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="phone-pad"
            maxLength={5}
            style={styles.codeInput}
          />
          <AppIcon name="chevron-down" size={14} color={colors.textSecondary} />
        </View>
        <View style={styles.divider} />
        <TextInput
          ref={ref}
          accessibilityLabel="Mobile number"
          value={number}
          onChangeText={(value) => onNumberChange(value.replace(/\D/g, "").slice(0, 15))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="98765 43210"
          placeholderTextColor={colors.textMuted}
          style={styles.phoneInput}
        />
      </View>
    </View>
  );
});

export function OtpInput({
  value,
  onChange,
  error = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, 5);
  const inputProps: TextInputProps = {
    value,
    editable: !disabled,
    keyboardType: "number-pad",
    autoComplete: "one-time-code",
    textContentType: "oneTimeCode",
    maxLength: 6,
    onChangeText: (text) => onChange(text.replace(/\D/g, "").slice(0, 6)),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Enter six digit verification code"
      onPress={() => input.current?.focus()}
      style={styles.otpWrap}
    >
      <TextInput ref={input} {...inputProps} style={styles.hiddenInput} />
      {Array.from({ length: 6 }, (_, index) => {
        const selected = focused && active === index && value.length < 6;
        return (
          <View key={index} style={[styles.otpSlot, selected && styles.otpFocused, error && styles.otpError]}>
            <Text style={[styles.otpDigit, !value[index] && styles.otpPlaceholder]}>{value[index] ?? "—"}</Text>
            {selected && !value[index] ? <View style={styles.cursor} /> : null}
          </View>
        );
      })}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.label, color: colors.textPrimary, marginBottom: spacing.sm },
  phoneShell: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  focused: { borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.1, shadowRadius: 8 },
  error: { borderColor: colors.error },
  codeGroup: { width: 132, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, gap: spacing.xs },
  globe: { width: 20, alignItems: "center", justifyContent: "center" },
  indiaFlag: { width: 25, height: 18, borderRadius: 5, overflow: "hidden", borderWidth: 0.5, borderColor: colors.border },
  flagSaffron: { flex: 1, backgroundColor: "#FF8A35" },
  flagWhite: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  flagWheel: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#27478A" },
  flagGreen: { flex: 1, backgroundColor: "#168349" },
  codeInput: { flex: 1, minHeight: 56, color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  divider: { width: 1, height: 28, backgroundColor: colors.border },
  phoneInput: { flex: 1, minHeight: 58, paddingHorizontal: spacing.md, color: colors.textPrimary, fontSize: 17, letterSpacing: 0.3 },
  otpWrap: { position: "relative", flexDirection: "row", justifyContent: "space-between", gap: 7 },
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
  otpSlot: {
    flex: 1,
    maxWidth: 52,
    aspectRatio: 0.88,
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  otpFocused: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  otpError: { borderColor: colors.error },
  otpDigit: { fontSize: 22, lineHeight: 27, fontWeight: "800", color: colors.textPrimary },
  otpPlaceholder: { color: "#9DC5B5", fontWeight: "600" },
  cursor: { position: "absolute", width: 2, height: 23, borderRadius: 1, backgroundColor: colors.primary },
});
