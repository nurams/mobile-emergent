import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useAuth } from "@/src/auth/auth-context";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { radius, spacing } from "@/src/tokens";

const COVER_IMG =
  "https://images.unsplash.com/photo-1576731753569-3e93a228048c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjd8MHwxfHNlYXJjaHwyfHxtb2Rlcm4lMjBjb3Jwb3JhdGUlMjBvZmZpY2UlMjBidWlsZGluZyUyMGV4dGVyaW9yfGVufDB8fHx8MTc5MTA4NzIxNnww&ixlib=rb-4.1.0&q=85";

export default function ProfileScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const rows = [
    { icon: "id-card-outline" as const, label: "ID Karyawan", value: user?.employee_id ?? "-" },
    { icon: "mail-outline" as const, label: "Email", value: user?.email ?? "-" },
    { icon: "briefcase-outline" as const, label: "Jabatan", value: user?.position || "-" },
    { icon: "business-outline" as const, label: "Departemen", value: user?.department || "-" },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: bottomChrome + spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.cover}>
        <Image source={{ uri: COVER_IMG }} style={styles.coverImg} contentFit="cover" blurRadius={2} />
        <LinearGradient
          colors={["rgba(30,41,59,0.35)", "rgba(30,41,59,0.85)"]}
          style={styles.coverScrim}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name?.[0] ?? "A").toUpperCase()}</Text>
        </View>
        <Text style={styles.name} testID="profile-name">
          {user?.name ?? "-"}
        </Text>
        <Text style={styles.role}>
          {(user?.position || "Karyawan") + " · " + (user?.department || "Umum")}
        </Text>

        <View style={styles.card}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.row, i < rows.length - 1 && styles.rowBorder]}>
              <View style={styles.rowIcon}>
                <Ionicons name={r.icon} size={20} color={colors.brand} />
              </View>
              <View style={styles.rowTextBox}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue} testID={`profile-${r.label}`}>{r.value}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  cover: { height: 180 },
  coverImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  coverScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  body: { alignItems: "center", paddingHorizontal: spacing.xl, marginTop: -44 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: colors.surface,
  },
  avatarText: { color: colors.onBrandPrimary, fontSize: 34, fontWeight: "800" },
  name: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: spacing.md },
  role: { color: colors.muted, fontSize: 14, marginTop: 2 },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextBox: { flex: 1 },
  rowLabel: { color: colors.muted, fontSize: 12 },
  rowValue: { color: colors.onSurface, fontSize: 15, fontWeight: "600", marginTop: 2 },
}));
