import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage } from "../utils/domain";
export const palette = {
  ink: "#142E2C",
  accent: "#146C55",
  canvas: "#F3F7F4",
  muted: "#526762",
  border: "#D5E2DA",
  danger: "#A22E2E",
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
export function Copy({ children }: { children: React.ReactNode }) {
  return <Text style={styles.copy}>{children}</Text>;
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Button({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}
export function Input({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View>
      <Text style={styles.copy}>{label}</Text>
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
      <View accessibilityLabel="Loading" style={styles.card}>
        <ActivityIndicator color={palette.accent} />
        <Copy>Loading…</Copy>
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
      <Card>
        <Copy>Nothing here yet. Try another date or search.</Copy>
      </Card>
    );
  return null;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", color: palette.ink },
  copy: { fontSize: 16, color: palette.muted, lineHeight: 24 },
  card: {
    padding: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
    marginBottom: 12,
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    marginVertical: 4,
  },
  buttonText: { fontSize: 16, color: "#FFFFFF", fontWeight: "600" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 12,
    fontSize: 17,
    color: palette.ink,
  },
});
