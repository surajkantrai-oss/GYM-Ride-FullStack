import { useRef, useState } from "react";
import {
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "../../components/AppIcon";
import { colors, radius, shadows, spacing, typography } from "../../components/theme";
import { onboardingVisuals } from "../../components/gym-visuals";

const pages = [
  {
    kicker: "DISCOVER",
    headline: "Your workout.\nWherever you are.",
    body: "Discover quality gyms around you and train on your terms.",
    image: onboardingVisuals[0],
  },
  {
    kicker: "CHOOSE YOUR WAY",
    headline: "Fitness that fits\nyour schedule.",
    body: "Compare gyms, passes and available slots before you book.",
    image: onboardingVisuals[1],
  },
  {
    kicker: "READY WHEN YOU ARE",
    headline: "Book. Check in.\nGet moving.",
    body: "Reserve your workout, check in securely and focus on your training.",
    image: onboardingVisuals[2],
  },
] as const;

export function OnboardingScreen({ onComplete }: { onComplete: () => Promise<void> }) {
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const goTo = (next: number) => {
    scroll.current?.scrollTo({ x: width * next, animated: true });
    setIndex(next);
  };
  const finish = () => {
    if (finishing) return;
    setFinishing(true);
    void onComplete().finally(() => setFinishing(false));
  };
  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>GYMRide</Text>
        {index < pages.length - 1 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Skip onboarding" onPress={finish} hitSlop={10}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : <View style={styles.skipPlaceholder} />}
      </View>
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {pages.map((page) => (
          <View key={page.kicker} style={[styles.page, { width }]}>
            <ImageBackground source={page.image} resizeMode="cover" imageStyle={styles.image} style={styles.visual}>
              <View style={styles.scrim} />
              <View style={styles.visualMark}>
                <Text style={styles.visualMarkText}>GR</Text>
              </View>
              <Text style={styles.visualCaption}>TRAIN ON YOUR TERMS</Text>
            </ImageBackground>
            <View style={styles.copy}>
              <Text style={styles.kicker}>{page.kicker}</Text>
              <Text accessibilityRole="header" style={styles.headline}>{page.headline}</Text>
              <Text style={styles.body}>{page.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <View accessibilityLabel={`Page ${index + 1} of ${pages.length}`} style={styles.dots}>
          {pages.map((page, dot) => (
            <View key={page.kicker} style={[styles.dot, dot === index && styles.dotActive]} />
          ))}
        </View>
        <View style={styles.actions}>
          {index > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Previous onboarding page" onPress={() => goTo(index - 1)} style={styles.back}>
              <AppIcon name="arrow-left" size={20} color={colors.textPrimary} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : <View style={styles.back} />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={index === pages.length - 1 ? "Get started" : "Next onboarding page"}
            accessibilityState={{ disabled: finishing }}
            disabled={finishing}
            onPress={() => index === pages.length - 1 ? finish() : goTo(index + 1)}
            style={({ pressed }) => [styles.next, pressed && styles.pressed, finishing && styles.disabled]}
          >
            <Text style={styles.nextText}>{index === pages.length - 1 ? "Get started" : "Next"}</Text>
            <AppIcon name="arrow-right" size={20} color={colors.white} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  topBar: {
    minHeight: 58,
    paddingHorizontal: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { ...typography.heading3, color: colors.white, letterSpacing: -0.3, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  skip: { ...typography.label, color: "#E0EEE7", padding: spacing.sm, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  skipPlaceholder: { width: 48 },
  pager: { flex: 1 },
  page: { flex: 1, paddingHorizontal: spacing.xl },
  visual: {
    flex: 1,
    minHeight: 270,
    maxHeight: 440,
    borderRadius: radius.largeCard,
    overflow: "hidden",
    justifyContent: "space-between",
    padding: spacing.xl,
    ...shadows.elevated,
  },
  image: { borderRadius: radius.largeCard },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(5, 24, 17, 0.34)" },
  visualMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  visualMarkText: { fontSize: 16, fontWeight: "900", color: colors.primary },
  visualCaption: { ...typography.caption, color: colors.white, letterSpacing: 1.6 },
  copy: { paddingTop: spacing["2xl"], minHeight: 210 },
  kicker: { ...typography.caption, color: colors.primary, letterSpacing: 1.7, marginBottom: spacing.sm },
  headline: { ...typography.heading1, color: colors.white, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  body: { ...typography.body, color: "#E0EEE7", marginTop: spacing.md, maxWidth: 360, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  dots: { height: 20, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.primary },
  actions: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { minWidth: 92, minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  backText: { ...typography.label, color: colors.white },
  next: {
    minWidth: 122,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  nextText: { ...typography.label, color: colors.white },
  pressed: { backgroundColor: colors.primaryPressed, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
});
