import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { ApiError, api, type BiometricsResponse } from "@/src/api/client";
import { useAuth } from "@/src/auth/auth-context";
import { useToast } from "@/src/components/toast";
import { authenticate, getCapability, getDeviceId } from "@/src/lib/biometrics";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { radius, spacing } from "@/src/tokens";

type BioType = "face" | "fingerprint";

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const { signOut } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [busy, setBusy] = useState<BioType | null>(null);

  const bioQ = useQuery({
    queryKey: ["biometrics"],
    queryFn: () => api.get<BiometricsResponse>("/biometrics"),
  });

  const removeMut = useMutation({
    mutationFn: (type: BioType) => api.del(`/biometrics/${type}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["biometrics"] }),
  });

  const onEnroll = async (type: BioType) => {
    setBusy(type);
    try {
      const cap = await getCapability();
      if (!cap.hasHardware) {
        toast.show("Perangkat ini tidak memiliki sensor biometrik", "error");
        return;
      }
      if (!cap.isDeviceEnrolled) {
        toast.show("Atur biometrik di pengaturan HP terlebih dahulu", "error");
        return;
      }
      const ok = await authenticate(
        type === "face" ? "Verifikasi wajah untuk mendaftar" : "Verifikasi sidik jari untuk mendaftar",
      );
      if (!ok) {
        toast.show("Verifikasi dibatalkan", "error");
        return;
      }
      const deviceId = await getDeviceId();
      await api.post(`/biometrics/enroll`, { type, device_id: deviceId });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(`${type === "face" ? "Wajah" : "Sidik jari"} berhasil didaftarkan`, "success");
      qc.invalidateQueries({ queryKey: ["biometrics"] });
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal mendaftar biometrik", "error");
    } finally {
      setBusy(null);
    }
  };

  const onRemove = async (type: BioType) => {
    try {
      await removeMut.mutateAsync(type);
      toast.show(`${type === "face" ? "Wajah" : "Sidik jari"} dihapus`, "info");
    } catch {
      toast.show("Gagal menghapus biometrik", "error");
    }
  };

  const onLogout = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await signOut();
    router.replace("/(auth)/login");
  };

  const items: { type: BioType; icon: any; title: string; sub: string }[] = [
    { type: "fingerprint", icon: "finger-print", title: "Sidik Jari", sub: "Maks. 1 sidik jari per akun" },
    { type: "face", icon: "scan", title: "Wajah", sub: "Maks. 1 wajah per akun" },
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Pengaturan</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomChrome + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.section}>Biometrik Absensi</Text>
        <View style={styles.card}>
          {bioQ.isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : (
            items.map((it, i) => {
              const state = bioQ.data?.[it.type];
              const enrolled = !!state?.enrolled;
              return (
                <View key={it.type} style={[styles.row, i < items.length - 1 && styles.rowBorder]}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={it.icon} size={22} color={colors.brand} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{it.title}</Text>
                    <Text style={[styles.rowSub, { color: enrolled ? colors.success : colors.muted }]}>
                      {enrolled ? "Terdaftar (1)" : "Belum terdaftar"} · {it.sub}
                    </Text>
                  </View>
                  {enrolled ? (
                    <Pressable
                      testID={`remove-${it.type}`}
                      onPress={() => onRemove(it.type)}
                      style={styles.removeBtn}
                      hitSlop={6}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </Pressable>
                  ) : (
                    <Pressable
                      testID={`enroll-${it.type}`}
                      disabled={busy !== null}
                      onPress={() => onEnroll(it.type)}
                      style={({ pressed }) => [styles.enrollBtn, pressed && { opacity: 0.85 }]}
                    >
                      {busy === it.type ? (
                        <ActivityIndicator size="small" color={colors.onBrandPrimary} />
                      ) : (
                        <Text style={styles.enrollText}>Daftar</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </View>

        <Text style={styles.hint}>
          Biometrik dibatasi 1 sidik jari & 1 wajah per akun untuk mencegah penyalahgunaan oleh orang lain.
        </Text>

        <Text style={styles.section}>Lainnya</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => Linking.openSettings()} testID="open-device-settings">
            <View style={styles.rowIcon}>
              <Ionicons name="phone-portrait-outline" size={22} color={colors.brand} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Pengaturan Perangkat</Text>
              <Text style={styles.rowSub}>Kelola izin lokasi & biometrik HP</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        </View>

        <Pressable testID="logout-button" onPress={onLogout} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.85 }]}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Keluar</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  scroll: { padding: spacing.lg, gap: spacing.sm },
  section: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  loadingRow: { paddingVertical: spacing.xl, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12, marginTop: 2, color: colors.muted },
  enrollBtn: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 72,
    alignItems: "center",
  },
  enrollText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  removeBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs, marginHorizontal: spacing.xs },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.error,
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
  },
  logoutText: { color: colors.error, fontSize: 16, fontWeight: "700" },
}));
