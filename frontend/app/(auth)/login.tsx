import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { ApiError } from "@/src/api/client";
import { useAuth } from "@/src/auth/auth-context";
import { useToast } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";
import { radius, spacing } from "@/src/tokens";

const OFFICE_IMG =
  "https://images.unsplash.com/photo-1576731753569-3e93a228048c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjd8MHwxfHNlYXJjaHwyfHxtb2Rlcm4lMjBjb3Jwb3JhdGUlMjBvZmZpY2UlMjBidWlsZGluZyUyMGV4dGVyaW9yfGVufDB8fHx8MTc5MTA4NzIxNnww&ixlib=rb-4.1.0&q=85";

export default function LoginScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      toast.show("Isi email dan password", "error");
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Gagal masuk, coba lagi";
      toast.show(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image source={{ uri: OFFICE_IMG }} style={styles.heroImg} contentFit="cover" />
          <LinearGradient
            colors={["rgba(15,23,42,0.1)", "rgba(15,23,42,0.85)"]}
            style={styles.scrim}
          />
          <View style={[styles.heroText, { paddingTop: insets.top + spacing.xl }]}>
            <View style={styles.logoBadge}>
              <Ionicons name="finger-print" size={26} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.brandName}>AbsensiKu</Text>
            <Text style={styles.heroSub}>Absensi karyawan berbasis lokasi & biometrik</Text>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.title} testID="login-title">
            Selamat Datang
          </Text>
          <Text style={styles.subtitle}>Masuk untuk melanjutkan absensi Anda</Text>

          <View style={styles.field}>
            <Ionicons name="mail-outline" size={20} color={colors.muted} />
            <TextInput
              testID="login-email-input"
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.field}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.muted} />
            <TextInput
              testID="login-password-input"
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              secureTextEntry={!showPwd}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable onPress={() => setShowPwd((v) => !v)} hitSlop={8} testID="login-toggle-password">
              <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
            </Pressable>
          </View>

          <Pressable
            testID="login-submit-button"
            onPress={onSubmit}
            disabled={loading}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, loading && styles.ctaDisabled]}
          >
            {loading ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.ctaText}>Masuk</Text>
            )}
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Belum punya akun? </Text>
            <Link href="/(auth)/register" asChild>
              <Pressable testID="go-to-register">
                <Text style={styles.footerLink}>Buat Akun</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, paddingBottom: spacing.xl },
  hero: { height: 300, justifyContent: "flex-end" },
  heroImg: { ...StyleSheetAbsolute() },
  scrim: { ...StyleSheetAbsolute() },
  heroText: { padding: spacing.xl, gap: spacing.xs },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  brandName: { color: "#FFFFFF", fontSize: 28, fontWeight: "800" },
  heroSub: { color: "#E2E8F0", fontSize: 14 },
  form: { padding: spacing.xl, gap: spacing.md },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: spacing.sm },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    height: 54,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 15, height: "100%" },
  cta: {
    marginTop: spacing.sm,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: { opacity: 0.88 },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.md },
  footerText: { color: colors.muted, fontSize: 14 },
  footerLink: { color: colors.brandPrimary, fontSize: 14, fontWeight: "700" },
}));

function StyleSheetAbsolute() {
  return { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };
}
