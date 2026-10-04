import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
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

export default function RegisterScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      toast.show("Nama, email, dan password (min 6 karakter) wajib diisi", "error");
      return;
    }
    setLoading(true);
    try {
      await signUp({
        name: name.trim(),
        email,
        password,
        position: position.trim() || undefined,
        department: department.trim() || undefined,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Gagal membuat akun";
      toast.show(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="register-back">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Buat Akun</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>Daftarkan data karyawan Anda</Text>

        <Field icon="person-outline" placeholder="Nama lengkap" value={name} onChangeText={setName} testID="register-name-input" />
        <Field icon="mail-outline" placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" testID="register-email-input" />
        <Field icon="lock-closed-outline" placeholder="Password (min 6 karakter)" value={password} onChangeText={setPassword} secureTextEntry testID="register-password-input" />
        <Field icon="briefcase-outline" placeholder="Jabatan (opsional)" value={position} onChangeText={setPosition} testID="register-position-input" />
        <Field icon="business-outline" placeholder="Departemen (opsional)" value={department} onChangeText={setDepartment} testID="register-department-input" />

        <Pressable
          testID="register-submit-button"
          onPress={onSubmit}
          disabled={loading}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, loading && styles.ctaDisabled]}
        >
          {loading ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.ctaText}>Daftar</Text>
          )}
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

function Field(props: {
  icon: any;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences";
  keyboardType?: "default" | "email-address";
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Ionicons name={props.icon} size={20} color={colors.muted} />
      <TextInput
        testID={props.testID}
        style={styles.input}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.autoCapitalize}
        keyboardType={props.keyboardType}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing["2xl"], gap: spacing.md },
  lead: { color: colors.muted, fontSize: 14, marginBottom: spacing.xs },
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
}));
