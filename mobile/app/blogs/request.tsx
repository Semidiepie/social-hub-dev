// Request permission to publish blogs.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, BlogPermission } from "@/src/api/client";
import { colors, radii, spacing } from "@/src/theme";

export default function BlogRequestPermission() {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [perm, setPerm] = useState<BlogPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.get<BlogPermission>("/blogs/me/permission");
        setPerm(p);
        if (p.requested_reason) setReason(p.requested_reason);
      } catch {
        // no-op
      }
    })();
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    if (reason.trim().length < 20) {
      setError("Tell the admin a bit more (min 20 characters).");
      return;
    }
    setBusy(true);
    try {
      await api.post("/blogs/request-permission", { reason: reason.trim() });
      setOk(true);
      setPerm({ granted: false, pending: true, requested_reason: reason.trim() });
    } catch (e: any) {
      setError(e?.message || "Could not submit request.");
    } finally {
      setBusy(false);
    }
  }, [reason]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Apply to blog</Text>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={styles.iconBox}>
            <Ionicons name="document-text" size={26} color={colors.primary} />
          </View>
          <Text style={styles.title}>Become a blog author</Text>
          <Text style={styles.body}>
            Tell the admin what you&apos;d like to write about — a couple of sentences is plenty.
            You&apos;ll be notified when it&apos;s reviewed.
          </Text>

          {perm?.granted ? (
            <View style={styles.grantedBox}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.grantedText}>You already have permission. Start writing!</Text>
              <TouchableOpacity style={styles.grantedBtn} onPress={() => router.replace("/blogs/new")}>
                <Text style={styles.grantedBtnText}>New blog</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {perm?.pending && (
                <View style={styles.pendingBox}>
                  <Ionicons name="time" size={16} color={colors.primary} />
                  <Text style={styles.pendingText}>Request pending admin review.</Text>
                </View>
              )}

              <Text style={styles.label}>Why you want to publish</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="I want to write about…"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                multiline
                numberOfLines={5}
                maxLength={500}
                testID="blog-request-reason"
              />

              {!!error && <Text style={styles.error}>{error}</Text>}
              {ok && (
                <Text style={styles.ok}>Request sent — you&apos;ll be notified after review.</Text>
              )}

              <TouchableOpacity
                onPress={submit}
                style={[styles.submit, busy && { opacity: 0.6 }]}
                disabled={busy}
                testID="blog-request-submit"
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={16} color="#fff" />
                    <Text style={styles.submitText}>
                      {perm?.pending ? "Update request" : "Send request"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, paddingTop: 4 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryFaint,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: "900" },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 6, marginBottom: spacing.md },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    color: colors.textPrimary,
    padding: 14,
    fontSize: 15,
    minHeight: 130,
    textAlignVertical: "top",
  },
  submit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: radii.full, paddingVertical: 14, marginTop: spacing.lg },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  error: { color: colors.danger, fontSize: 13, marginTop: 10 },
  ok: { color: colors.success, fontSize: 13, marginTop: 10 },
  pendingBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primaryFaint, borderColor: colors.primary, borderWidth: 1, padding: 10, borderRadius: radii.md, marginBottom: spacing.md },
  pendingText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  grantedBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, padding: 14, borderRadius: radii.md, marginTop: spacing.md },
  grantedText: { color: colors.textPrimary, flex: 1, fontSize: 13, fontWeight: "700" },
  grantedBtn: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.full },
  grantedBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
