import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, ConversationPreview, UserPublic } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";
import VerifiedBadge from "../../src/components/VerifiedBadge";

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

export default function NewMessage() {
  const router = useRouter();
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserPublic[]>([]);
  const [selected, setSelected] = useState<UserPublic[]>([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const r = await api.get<{ users: UserPublic[] }>(`/search?q=${encodeURIComponent(q)}`);
        setResults((r.users || []).filter((u) => u.id !== me?.id));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, me?.id]);

  const toggle = (u: UserPublic) => {
    setSelected((prev) =>
      prev.some((p) => p.id === u.id) ? prev.filter((p) => p.id !== u.id) : [...prev, u],
    );
  };

  const start = async () => {
    if (selected.length === 0 || creating) return;
    setCreating(true);
    try {
      const isGroup = selected.length > 1;
      const conv = await api.post<ConversationPreview>("/conversations", {
        member_ids: selected.map((s) => s.id),
        name: isGroup && groupName.trim() ? groupName.trim() : null,
      });
      router.replace(`/messages/${conv.id}`);
    } finally {
      setCreating(false);
    }
  };

  const isGroup = selected.length > 1;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="new-msg-back">
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>New message</Text>
          <TouchableOpacity
            onPress={start}
            disabled={selected.length === 0 || creating}
            style={[styles.startBtn, (selected.length === 0 || creating) && { opacity: 0.4 }]}
            testID="new-msg-start"
          >
            {creating ? (
              <ActivityIndicator color={colors.bg} size="small" />
            ) : (
              <Text style={styles.startText}>Chat</Text>
            )}
          </TouchableOpacity>
        </View>

        {selected.length > 0 && (
          <View style={styles.chips}>
            {selected.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={styles.chip}
                onPress={() => toggle(u)}
                testID={`new-msg-chip-${u.username}`}
              >
                <Image source={{ uri: u.avatar_url || FALLBACK }} style={styles.chipAvatar} />
                <Text style={styles.chipText}>{u.display_name}</Text>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isGroup && (
          <View style={styles.groupNameWrap}>
            <Ionicons name="people" size={18} color={colors.primary} />
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Squad name (optional)"
              placeholderTextColor={colors.textMuted}
              style={styles.groupNameInput}
              testID="new-msg-group-name"
            />
          </View>
        )}

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search gamers to add…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={styles.searchInput}
            testID="new-msg-search"
          />
        </View>

        {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />}

        <FlatList
          data={results}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            !loading && q ? (
              <Text style={styles.empty}>No matches.</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const picked = selected.some((s) => s.id === item.id);
            return (
              <TouchableOpacity
                style={[styles.row, picked && { backgroundColor: colors.primaryFaint }]}
                onPress={() => toggle(item)}
                testID={`new-msg-user-${item.username}`}
              >
                <Image source={{ uri: item.avatar_url || FALLBACK }} style={styles.avatar} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.displayName}>{item.display_name}</Text>
                    {<VerifiedBadge user={item} size={13} />}
                  </View>
                  <Text style={styles.username}>@{item.username}</Text>
                </View>
                <Ionicons
                  name={picked ? "checkmark-circle" : "ellipse-outline"}
                  size={22}
                  color={picked ? colors.primary : colors.textSecondary}
                />
              </TouchableOpacity>
            );
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  startBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full, minWidth: 64, alignItems: "center" },
  startText: { color: colors.bg, fontWeight: "800", fontSize: 14 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, padding: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 1 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.full },
  chipAvatar: { width: 22, height: 22, borderRadius: 11 },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },

  groupNameWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.primaryFaint, borderRadius: radii.md, borderColor: colors.primaryMuted, borderWidth: 1 },
  groupNameInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 12 },

  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, margin: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radii.md },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 12 },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  displayName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  username: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  empty: { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl, fontSize: 14 },
});
