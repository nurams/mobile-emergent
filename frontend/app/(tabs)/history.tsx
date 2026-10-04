import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api, type AttendanceRecord } from "@/src/api/client";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { radius, spacing } from "@/src/tokens";

dayjs.locale("id");

const EMPTY_IMG =
  "https://images.unsplash.com/photo-1651760680066-db9d32bd0357?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDB8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGNhbGVuZGFyJTIwY2xpcGJvYXJkfGVufDB8fHx8MTc5MTA4NzIxNnww&ixlib=rb-4.1.0&q=85";

function lastMonths(count: number) {
  const out: { key: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = dayjs().subtract(i, "month");
    out.push({ key: d.format("YYYY-MM"), label: d.format("MMM YYYY") });
  }
  return out;
}

export default function HistoryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const months = lastMonths(6);
  const [month, setMonth] = useState(months[0].key);

  const historyQ = useQuery({
    queryKey: ["history", month],
    queryFn: () => api.get<AttendanceRecord[]>(`/attendance?month=${month}`),
  });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Riwayat Absensi</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          {months.map((m) => {
            const active = m.key === month;
            return (
              <Pressable
                key={m.key}
                testID={`month-chip-${m.key}`}
                onPress={() => setMonth(m.key)}
                style={[
                  styles.chip,
                  { backgroundColor: active ? colors.brandPrimary : colors.surfaceTertiary, borderColor: active ? colors.brandPrimary : colors.border },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {historyQ.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : historyQ.isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Gagal memuat riwayat</Text>
          <Pressable testID="history-retry" style={styles.retryBtn} onPress={() => historyQ.refetch()}>
            <Text style={styles.retryText}>Coba Lagi</Text>
          </Pressable>
        </View>
      ) : (historyQ.data?.length ?? 0) === 0 ? (
        <View style={styles.center}>
          <Image source={{ uri: EMPTY_IMG }} style={styles.emptyImg} contentFit="cover" />
          <Text style={styles.emptyTitle}>Belum ada riwayat absensi</Text>
          <Text style={styles.emptyText}>Riwayat untuk bulan ini akan muncul di sini.</Text>
        </View>
      ) : (
        <FlatList
          data={historyQ.data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomChrome + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <HistoryCard record={item} />}
        />
      )}
    </View>
  );
}

function HistoryCard({ record }: { record: AttendanceRecord }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const d = dayjs(record.date);
  const badgeColor =
    record.status === "terlambat" ? colors.warning : colors.success;

  return (
    <View style={styles.card} testID={`history-card-${record.date}`}>
      <View style={styles.cardDateBox}>
        <Text style={styles.cardDay}>{d.format("DD")}</Text>
        <Text style={styles.cardMon}>{d.format("MMM")}</Text>
      </View>
      <View style={styles.cardMid}>
        <Text style={styles.cardWeekday}>{d.format("dddd")}</Text>
        <View style={styles.cardTimes}>
          <View style={styles.timePill}>
            <Ionicons name="log-in-outline" size={14} color={colors.success} />
            <Text style={styles.timeText}>
              {record.check_in_time ? dayjs(record.check_in_time).format("HH:mm") : "--:--"}
            </Text>
          </View>
          <View style={styles.timePill}>
            <Ionicons name="log-out-outline" size={14} color={colors.muted} />
            <Text style={styles.timeText}>
              {record.check_out_time ? dayjs(record.check_out_time).format("HH:mm") : "--:--"}
            </Text>
          </View>
        </View>
      </View>
      <View style={[styles.badge, { backgroundColor: badgeColor }]}>
        <Text style={styles.badgeText}>{record.status === "terlambat" ? "Telat" : "Hadir"}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  title: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: "800",
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  chipScroll: { height: 56 },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.xl, alignItems: "center" },
  chip: {
    height: 36,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipText: { fontSize: 13, fontWeight: "600" },
  list: { padding: spacing.lg, gap: spacing.md },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  cardDateBox: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardDay: { color: colors.brand, fontSize: 20, fontWeight: "800" },
  cardMon: { color: colors.brand, fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  cardMid: { flex: 1, gap: spacing.sm },
  cardWeekday: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  cardTimes: { flexDirection: "row", gap: spacing.sm },
  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  timeText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  badge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyImg: { width: 120, height: 120, borderRadius: radius.lg, marginBottom: spacing.md, opacity: 0.9 },
  emptyTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  retryBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryText: { color: colors.onBrandPrimary, fontWeight: "700" },
}));
