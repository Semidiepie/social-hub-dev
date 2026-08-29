import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";

interface Privacy {
  followers_private: boolean;
  following_private: boolean;
}

export default function PrivacySettings() {
  const router = useRouter();
  const [state, setState] = useState<Privacy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Privacy | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Privacy>("/users/me/privacy");
      setState(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (key: keyof Privacy, value: boolean) => {
    if (!state) return;
    setSaving(key);
    setState({ ...state, [key]: value });
    try {
      const r = await api.put<Privacy>("/users/me/privacy", { [key]: value });
      setState(r);
    } catch {
      // revert on error
      setState({ ...state });
    } finally {
      setSaving(null);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Privacy</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading || !state ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionLabel}>Profile lists</Text>
          <View style={styles.card}>
            <ToggleRow
              icon="people-outline"
              label="Hide my followers list"
              hint="Only you can see who follows you."
              value={state.followers_private}
              busy={saving === "followers_private"}
              onChange={(v) => toggle("followers_private", v)}
              testID="privacy-followers-private"
            />
            <ToggleRow
              icon="person-add-outline"
              label="Hide who I follow"
              hint="Only you can see who you follow."
              value={state.following_private}
              busy={saving === "following_private"}
              onChange={(v) => toggle("following_private", v)}
              testID="privacy-following-private"
            />
          </View>

          <Text style={styles.note}>
            These toggles only hide the <Text style={{ fontWeight: "800" }}>lists</Text> from other users.
            Your follower / following <Text style={{ fontWeight: "800" }}>counts</Text> on your profile
            still show — just the names behind the numbers are private.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ToggleRow({
  icon,
  label,
  hint,
  value,
  busy,
  onChange,
  testID,
}: {
  icon: any;
  label: string;
  hint: string;
  value: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={busy}
        trackColor={{ false: colors.elevated, true: colors.primary }}
        thumbColor="#fff"
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  body: { padding: spacing.md, gap: spacing.md },
  sectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 14, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  rowHint: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, paddingHorizontal: spacing.sm, marginTop: spacing.sm },
});
