import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import "dayjs/locale/id";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import {
  ApiError,
  api,
  type AttendanceRecord,
  type BiometricsResponse,
  type OfficeLocation,
} from "@/src/api/client";
import { useAuth } from "@/src/auth/auth-context";
import { useToast } from "@/src/components/toast";
import { authenticate, getCapability, getDeviceId } from "@/src/lib/biometrics";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { radius, spacing } from "@/src/tokens";

dayjs.locale("id");

type LocState =
  | { status: "loading" }
  | { status: "denied"; canAskAgain: boolean }
  | { status: "ready"; lat: number; lng: number };

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dphi = toRad(lat2 - lat1);
  const dlmb = toRad(lng2 - lng1);
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlmb / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [loc, setLoc] = useState<LocState>({ status: "loading" });
  const [punching, setPunching] = useState<null | "face" | "fingerprint">(null);

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const officeQ = useQuery({
    queryKey: ["office"],
    queryFn: () => api.get<OfficeLocation>("/office-location"),
  });
  const todayQ = useQuery({
    queryKey: ["today"],
    queryFn: () => api.get<{ date: string; record: AttendanceRecord | null }>("/attendance/today"),
  });
  const bioQ = useQuery({
    queryKey: ["biometrics"],
    queryFn: () => api.get<BiometricsResponse>("/biometrics"),
  });

  const fetchLocation = useCallback(async () => {
    setLoc({ status: "loading" });
    const perm = await Location.getForegroundPermissionsAsync();
    let granted = perm.granted;
    let canAskAgain = perm.canAskAgain;
    if (!granted) {
      const req = await Location.requestForegroundPermissionsAsync();
      granted = req.granted;
      canAskAgain = req.canAskAgain;
    }
    if (!granted) {
      setLoc({ status: "denied", canAskAgain });
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLoc({ status: "ready", lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setLoc({ status: "denied", canAskAgain: true });
    }
  }, []);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  const office = officeQ.data;
  const record = todayQ.data?.record ?? null;

  const distance =
    loc.status === "ready" && office
      ? haversineM(loc.lat, loc.lng, office.lat, office.lng)
      : null;
  const inside = distance != null && office ? distance <= office.radius_m : false;

  const action: "checkin" | "checkout" | "done" = !record?.check_in_time
    ? "checkin"
    : !record?.check_out_time
      ? "checkout"
      : "done";

  const onPunch = async (method: "face" | "fingerprint") => {
    if (action === "done") {
      toast.show("Absensi hari ini sudah lengkap", "info");
      return;
    }
    const enrolled = bioQ.data?.[method]?.enrolled;
    if (!enrolled) {
      toast.show(
        `Biometrik ${method === "face" ? "wajah" : "sidik jari"} belum terdaftar. Buka Setting.`,
        "error",
      );
      return;
    }
    if (loc.status !== "ready") {
      toast.show("Lokasi belum aktif", "error");
      return;
    }
    if (!inside) {
      toast.show("Anda berada di luar area kantor", "error");
      return;
    }
    const cap = await getCapability();
    if (!cap.hasHardware || !cap.isDeviceEnrolled) {
      toast.show("Perangkat tidak mendukung biometrik atau belum diatur di HP", "error");
      return;
    }
    setPunching(method);
    try {
      const ok = await authenticate(
        action === "checkin" ? "Verifikasi untuk Check In" : "Verifikasi untuk Check Out",
      );
      if (!ok) {
        toast.show("Verifikasi biometrik dibatalkan", "error");
        return;
      }
      await getDeviceId();
      const path = action === "checkin" ? "/attendance/checkin" : "/attendance/checkout";
      await api.post<AttendanceRecord>(path, { lat: loc.lat, lng: loc.lng, method });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(action === "checkin" ? "Check In berhasil!" : "Check Out berhasil!", "success");
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["history"] });
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal melakukan absen", "error");
    } finally {
      setPunching(null);
    }
  };

  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={styles.hello}>Halo, {firstName} 👋</Text>
          <Text style={styles.date}>{dayjs().format("dddd, D MMMM YYYY")}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name?.[0] ?? "A").toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Geolocation status card */}
        <View
          style={[
            styles.geoCard,
            { backgroundColor: inside ? colors.success : loc.status === "ready" ? colors.warning : colors.surfaceInverse },
          ]}
          testID="geo-status-card"
        >
          <View style={styles.geoTop}>
            <Ionicons name="location" size={20} color="#FFFFFF" />
            <Text style={styles.geoOffice}>{office?.name ?? "Kantor"}</Text>
          </View>
          {loc.status === "loading" ? (
            <ActivityIndicator color="#FFFFFF" style={{ marginVertical: spacing.sm }} />
          ) : loc.status === "denied" ? (
            <>
              <Text style={styles.geoStatus}>Izin lokasi diperlukan</Text>
              <Text style={styles.geoSub}>Aktifkan lokasi untuk melakukan absensi.</Text>
              <Pressable
                testID="enable-location-button"
                style={styles.geoBtn}
                onPress={() => (loc.canAskAgain ? fetchLocation() : Linking.openSettings())}
              >
                <Text style={styles.geoBtnText}>
                  {loc.canAskAgain ? "Aktifkan Lokasi" : "Buka Pengaturan"}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.geoStatus} testID="geo-status-text">
                {inside ? "Di dalam area kantor" : "Di luar area kantor"}
              </Text>
              <Text style={styles.geoSub}>
                Jarak {distance != null ? `${Math.round(distance)}m` : "-"} dari titik kantor
                {office ? ` · radius ${Math.round(office.radius_m)}m` : ""}
              </Text>
            </>
          )}
        </View>

        {/* Today status card */}
        <View style={styles.todayCard} testID="today-card">
          <Text style={styles.todayTitle}>Absensi Hari Ini</Text>
          <View style={styles.todayRow}>
            <View style={styles.todayItem}>
              <View style={[styles.todayIcon, { backgroundColor: colors.brandTertiary }]}>
                <Ionicons name="log-in-outline" size={20} color={colors.brand} />
              </View>
              <Text style={styles.todayLabel}>Check In</Text>
              <Text style={styles.todayTime} testID="today-checkin">
                {record?.check_in_time ? dayjs(record.check_in_time).format("HH:mm") : "--:--"}
              </Text>
            </View>
            <View style={styles.todaySep} />
            <View style={styles.todayItem}>
              <View style={[styles.todayIcon, { backgroundColor: colors.surfaceTertiary }]}>
                <Ionicons name="log-out-outline" size={20} color={colors.onSurfaceTertiary} />
              </View>
              <Text style={styles.todayLabel}>Check Out</Text>
              <Text style={styles.todayTime} testID="today-checkout">
                {record?.check_out_time ? dayjs(record.check_out_time).format("HH:mm") : "--:--"}
              </Text>
            </View>
          </View>
          {record?.status ? (
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: record.status === "terlambat" ? colors.warning : colors.success },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {record.status === "terlambat" ? "Terlambat" : "Hadir"}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.punchLabel}>
          {action === "checkin"
            ? "Pilih metode untuk Check In"
            : action === "checkout"
              ? "Pilih metode untuk Check Out"
              : "Absensi hari ini sudah lengkap ✅"}
        </Text>
      </ScrollView>

      {/* Sticky punch actions */}
      <View style={[styles.actionBar, { paddingBottom: bottomChrome + spacing.md }]}>
        <Pressable
          testID="punch-fingerprint-button"
          disabled={action === "done" || punching !== null}
          onPress={() => onPunch("fingerprint")}
          style={({ pressed }) => [
            styles.punchBtn,
            { backgroundColor: colors.brandPrimary },
            (pressed || punching === "fingerprint") && styles.punchPressed,
            action === "done" && styles.punchDisabled,
          ]}
        >
          {punching === "fingerprint" ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Ionicons name="finger-print" size={24} color={colors.onBrandPrimary} />
              <Text style={styles.punchText}>Sidik Jari</Text>
            </>
          )}
        </Pressable>
        <Pressable
          testID="punch-face-button"
          disabled={action === "done" || punching !== null}
          onPress={() => onPunch("face")}
          style={({ pressed }) => [
            styles.punchBtn,
            styles.punchBtnOutline,
            (pressed || punching === "face") && styles.punchPressed,
            action === "done" && styles.punchDisabled,
          ]}
        >
          {punching === "face" ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : (
            <>
              <Ionicons name="scan" size={24} color={colors.brandPrimary} />
              <Text style={[styles.punchText, { color: colors.brandPrimary }]}>Wajah</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  hello: { color: colors.onSurface, fontSize: 20, fontWeight: "800" },
  date: { color: colors.muted, fontSize: 13, marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  geoCard: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.xs },
  geoTop: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  geoOffice: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", opacity: 0.95 },
  geoStatus: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", marginTop: spacing.xs },
  geoSub: { color: "#FFFFFF", fontSize: 13, opacity: 0.9 },
  geoBtn: {
    marginTop: spacing.md,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignSelf: "flex-start",
  },
  geoBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  todayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
  },
  todayTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  todayRow: { flexDirection: "row", alignItems: "center" },
  todayItem: { flex: 1, alignItems: "center", gap: spacing.xs },
  todaySep: { width: 1, height: 60, backgroundColor: colors.divider },
  todayIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  todayLabel: { color: colors.muted, fontSize: 12 },
  todayTime: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  statusBadge: {
    alignSelf: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  statusBadgeText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  punchLabel: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  actionBar: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  punchBtn: {
    flex: 1,
    height: 58,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  punchBtnOutline: {
    backgroundColor: colors.brandTertiary,
  },
  punchPressed: { opacity: 0.85 },
  punchDisabled: { opacity: 0.45 },
  punchText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
}));
