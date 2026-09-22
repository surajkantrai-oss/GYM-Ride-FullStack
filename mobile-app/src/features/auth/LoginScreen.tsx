import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { Button, Copy, Input, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";
import { validOtp, validPhone } from "../../utils/domain";
export function LoginScreen() {
  const { api, signIn } = useSession();
  const [phone, setPhone] = useState("+91");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [developmentOtp, setDevelopmentOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
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
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen top>
        <Copy>GYMRide • train on your terms</Copy>
        <Title>
          {step === "phone"
            ? "Your next workout starts here."
            : "Verify your number"}
        </Title>
        <Copy>Find a gym, choose your time, and make room for fitness.</Copy>
        {step === "phone" ? (
          <>
            <Input
              label="Phone with country code"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="+919876543212"
            />
            <Copy>Include your country calling code, for example +91.</Copy>
            <Button
              label="Send code"
              disabled={!validPhone(phone) || request.isPending}
              onPress={() => request.mutate()}
            />
          </>
        ) : (
          <>
            <Copy>Enter the six-digit code sent to {phone}.</Copy>
            <Input
              label="Verification code"
              value={otp}
              onChangeText={(text) =>
                setOtp(text.replace(/\D/g, "").slice(0, 6))
              }
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
            />
            <Button
              label="Verify and continue"
              disabled={!validOtp(otp) || verify.isPending}
              onPress={() => verify.mutate()}
            />
            <Button
              label={cooldown ? `Resend in ${cooldown}s` : "Resend code"}
              disabled={cooldown > 0 || request.isPending}
              onPress={() => request.mutate()}
            />
            <Button
              label="Change phone number"
              disabled={verify.isPending}
              onPress={() => {
                setStep("phone");
                setOtp("");
                setDevelopmentOtp("");
                verify.reset();
              }}
            />
            {developmentOtp && (
              <Copy>Development-only code: {developmentOtp}</Copy>
            )}
          </>
        )}
        <State
          loading={request.isPending || verify.isPending}
          error={request.error || verify.error}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
