import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api } from "../../src/api/client";
import { colors, spacing } from "../../src/theme";

/**
 * Studio Announce update, matching the web page (frontend/src/pages/AdminAnnounce.jsx):
 * title + message + destination, POST /admin/broadcast, sent to all users.
 * The web page also lets an admin search for a single user to message
 * (GET /search?q=); the broadcast form below is the "send to all users" flow.
 */
export default function AdminAnnounce() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [destination, setDestination] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const send = async () => {
    if (!title.trim() || !message.trim()) { Alert.alert("Announce update", "Add a title and a message first."); return; }
    setSending(true);
    try {
      await api.post("/admin/broadcast", { title: title.trim(), message: message.trim(), destination: destination.trim() || undefined });
      setSent(true); setTitle(""); setMessage(""); setDestination("");
    } catch (e: any) { Alert.alert("Announce update", e?.message || "Failed to send"); } finally { setSending(false); }
  };
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Announce update" }} />
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} placeholder="Update title" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} testID="admin-announce-title" />
        <Text style={styles.label}>Message</Text>
        <TextInput style={[styles.input, styles.message]} placeholder="What should all users hear about?" placeholderTextColor={colors.textMuted} value={message} onChangeText={setMessage} multiline testID="admin-announce-message" />
        <Text style={styles.label}>Destination (optional)</Text>
        <TextInput style={styles.input} placeholder="e.g. /live — leave empty for the home feed" placeholderTextColor={colors.textMuted} value={destination} onChangeText={setDestination} testID="admin-announce-destination" />
        <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.7 }]} onPress={send} disabled={sending} testID="admin-announce-send">
          <Text style={styles.sendText}>{sending ? "Sending..." : "Send to all users"}</Text>
        </TouchableOpacity>
        {sent && <Text style={styles.sent}>Update sent to all users.</Text>}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  scroll: { flex: 1 },
  label: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 14 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 6 },
  message: { minHeight: 120, textAlignVertical: "top" },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 20 },
  sendText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  sent: { color: colors.success, fontSize: 14, marginTop: 12 },
});
