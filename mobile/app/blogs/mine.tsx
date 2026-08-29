// My blogs — drafts + published, with edit/delete.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api, Blog } from "@/src/api/client";
import { colors, radii, spacing } from "@/src/theme";

export default function MyBlogs() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await api.get<Blog[]>("/blogs/mine");
      setItems(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const del = useCallback(
    (blog: Blog) => {
      const doDel = async () => {
        try {
          await api.del(`/blogs/${blog.id}`);
          setItems((prev) => prev.filter((b) => b.id !== blog.id));
        } catch (e: any) {
          if (Platform.OS === "web") window.alert(e?.message || "Delete failed");
          else Alert.alert("Delete failed", e?.message || "Try again");
        }
      };
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && window.confirm(`Delete "${blog.title}"?`)) doDel();
      } else {
        Alert.alert("Delete?", `"${blog.title}"`, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDel },
        ]);
      }
    },
    [],
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My blogs</Text>
          <TouchableOpacity onPress={() => router.push("/blogs/new")} style={styles.iconBtn} testID="my-blog-new">
            <Ionicons name="add" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <FlatList
        data={items}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingBottom: 40 + insets.bottom,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="documents-outline" size={30} color={colors.textMuted} />
              <Text style={styles.emptyText}>No blogs yet</Text>
              <Text style={styles.emptySub}>Tap + to write your first one.</Text>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
            onPress={() => router.push(`/blogs/edit/${item.id}`)}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.statusRow}>
                <View style={[styles.statusPill, item.status === "published" ? styles.pubPill : styles.draftPill]}>
                  <Text style={[styles.statusText, item.status === "published" ? styles.pubText : styles.draftText]}>
                    {item.status === "published" ? "PUBLISHED" : "DRAFT"}
                  </Text>
                </View>
                <Text style={styles.dateText}>
                  {new Date(item.updated_at).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {item.title || "Untitled"}
              </Text>
              {!!item.subtitle && (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {item.subtitle}
                </Text>
              )}
              <View style={styles.actions}>
                {item.status === "published" && (
                  <TouchableOpacity
                    onPress={() => router.push(`/blogs/${item.id}`)}
                    style={styles.actionBtn}
                  >
                    <Ionicons name="eye-outline" size={14} color={colors.textPrimary} />
                    <Text style={styles.actionText}>View</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => router.push(`/blogs/edit/${item.id}`)}
                  style={styles.actionBtn}
                >
                  <Ionicons name="create-outline" size={14} color={colors.textPrimary} />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => del(item)}
                  style={[styles.actionBtn, styles.actionDanger]}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, paddingTop: 4 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  empty: { alignItems: "center", paddingVertical: spacing.xl, gap: 6 },
  emptyText: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  emptySub: { color: colors.textMuted, fontSize: 12 },
  errorText: { color: colors.danger, fontSize: 13, marginTop: 10 },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.sm },
  pubPill: { backgroundColor: "rgba(40,180,99,0.14)" },
  draftPill: { backgroundColor: colors.elevated },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  pubText: { color: colors.success },
  draftText: { color: colors.textSecondary },
  dateText: { color: colors.textMuted, fontSize: 11 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  actions: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  actionDanger: { borderColor: "rgba(255,59,48,0.4)" },
  actionText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
});
