import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation } from "@tanstack/react-query";
import { BrandLockup, GymBackground } from "../../components/app-backgrounds";
import { OtpInput, PhoneInput } from "../../components/auth-controls";
import { Button } from "../../components/ui";
import { colors, radius, shadows, spacing, typography } from "../../components/theme";
import { useSession } from "../../store/session";
import { errorMessage, validOtp, validPhone } from "../../utils/domain";

function displayPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+91") && digits.length === 12)
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return phone;
}

export function LoginScreen() {
  const { height } = useWindowDimensions();
  const { api, signIn } = useSession();
  const [countryCode, setCountryCode] = useState("+91");
  const [number, setNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [developmentOtp, setDevelopmentOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const phone = useMemo(() => `${countryCode}${number}`, [countryCode, number]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const request = useMutation({
    mutationFn: () => api.requestOtp(phone),
    onSuccess: (result) => {
      setStep("otp");
      setOtp("");
      setCooldown(45);
      setDevelopmentOtp(
        process.env.EXPO_PUBLIC_APP_ENV === "development"
          ? (result.developmentOtp ?? "")
          : "",
      );
    },
  });
  const verify = useMutation({
    mutationFn: async () => {
      const result = await api.verifyOtp(phone, otp);
      await signIn(result);
    },
    onSuccess: () => {
      setOtp("");
      setDevelopmentOtp("");
    },
  });

  const changeNumber = () => {
    setStep("phone");
    setOtp("");
    setDevelopmentOtp("");
    request.reset();
    verify.reset();
  };
  const authError = request.error || verify.error;
  const photoHeight = Math.max(265, Math.min(365, height * 0.4));

  return (
    <GymBackground overlay={0.2}>
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.scroll}
          >
            <View style={[styles.photo, { minHeight: photoHeight }]}>
              <BrandLockup light />
            </View>

            {step === "phone" ? (
              <View style={styles.sheet}>
                <View style={styles.headingBlock}>
                  <Text accessibilityRole="header" style={styles.title}>Welcome to GymRide</Text>
                  <Text style={styles.subtitle}>Find your gym. Train your way.</Text>
                </View>
                <PhoneInput
                  countryCode={countryCode}
                  number={number}
                  onCountryCodeChange={(value) => {
                    request.reset();
                    setCountryCode(value);
                  }}
                  onNumberChange={(value) => {
                    request.reset();
                    setNumber(value);
                  }}
                  error={Boolean(request.error)}
                />
                {request.error ? <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage(request.error)}</Text> : null}
                <Text style={styles.helper}>We’ll send you a verification code.</Text>
                <Button label="Continue  →" loading={request.isPending} disabled={!validPhone(phone)} onPress={() => request.mutate()} />
                <Text style={styles.legal}>By continuing, you agree to our{`\n`}<Text style={styles.legalLink}>Terms of Service</Text> and <Text style={styles.legalLink}>Privacy Policy</Text>.</Text>
              </View>
            ) : (
              <View style={[styles.sheet, styles.otpSheet]}>
                <View style={styles.headingBlock}>
                  <Text accessibilityRole="header" style={styles.title}>Verify your number</Text>
                  <Text style={styles.subtitle}>We sent a 6-digit code to</Text>
                </View>
                <View style={styles.phoneRow}>
                  <Text style={styles.phone}>{displayPhone(phone)}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Change phone number" onPress={changeNumber}>
                    <Text style={styles.change}>Change</Text>
                  </Pressable>
                </View>
                <OtpInput value={otp} disabled={verify.isPending} error={Boolean(verify.error)} onChange={(value) => {
                  verify.reset();
                  setOtp(value);
                }} />
                {authError ? <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage(authError)}</Text> : null}
                <Button label="Verify & Continue  →" loading={verify.isPending} disabled={!validOtp(otp)} onPress={() => verify.mutate()} />
                <View style={styles.resendRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={cooldown ? `Resend available in ${cooldown} seconds` : "Resend code"}
                    accessibilityState={{ disabled: cooldown > 0 || request.isPending }}
                    disabled={cooldown > 0 || request.isPending}
                    onPress={() => request.mutate()}
                  >
                    <Text style={[styles.resend, cooldown > 0 && styles.resendDisabled]}>
                      {cooldown ? <>Resend code in <Text style={styles.resendTime}>00:{String(cooldown).padStart(2, "0")}</Text></> : "Resend code"}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.dividerRow}>
                  <View style={styles.divider} /><Text style={styles.or}>OR</Text><View style={styles.divider} />
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Change phone number" onPress={changeNumber}>
                  <Text style={styles.changePhone}>Change phone number</Text>
                </Pressable>
                {developmentOtp ? (
                  <View style={styles.devCard}>
                    <Text style={styles.devBadge}>DEV</Text>
                    <Text style={styles.devText}>Local verification code</Text>
                    <Text selectable style={styles.devCode}>{developmentOtp}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GymBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "flex-end" },
  photo: { alignItems: "center", justifyContent: "flex-start", paddingTop: spacing.lg },
  sheet: {
    minHeight: 470,
    backgroundColor: "rgba(255,253,248,0.98)",
    borderTopLeftRadius: 38,
    borderTopRightRadius: 38,
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing["2xl"],
    paddingBottom: spacing["3xl"],
    gap: spacing.lg,
    ...shadows.elevated,
  },
  otpSheet: { minHeight: 500 },
  headingBlock: { alignItems: "center", gap: spacing.xs },
  title: { ...typography.heading1, color: colors.textPrimary, textAlign: "center" },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  helper: { ...typography.bodySmall, color: colors.textSecondary, marginTop: -4 },
  legal: { ...typography.caption, color: colors.textSecondary, textAlign: "center", marginTop: spacing.md },
  legalLink: { color: colors.primary, textDecorationLine: "underline" },
  phoneRow: { alignItems: "center", gap: 2, marginTop: -8, marginBottom: spacing.sm },
  phone: { ...typography.heading3, color: colors.textPrimary },
  change: { ...typography.label, color: colors.primary, textDecorationLine: "underline" },
  resendRow: { alignItems: "center", gap: spacing.xs },
  resend: { ...typography.bodySmall, color: colors.primary },
  resendTime: { color: colors.textPrimary, fontWeight: "800" },
  resendDisabled: { color: colors.textMuted },
  errorText: { ...typography.bodySmall, color: colors.error },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing["2xl"] },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { ...typography.caption, color: colors.textSecondary },
  changePhone: { ...typography.bodySmall, color: colors.primary, textAlign: "center", textDecorationLine: "underline", fontWeight: "700" },
  devCard: { marginTop: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.input, backgroundColor: colors.primaryMuted },
  devBadge: { fontSize: 10, fontWeight: "900", letterSpacing: 1, color: colors.primary, borderWidth: 1, borderColor: colors.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  devText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  devCode: { ...typography.heading3, color: colors.textPrimary, letterSpacing: 2 },
});
