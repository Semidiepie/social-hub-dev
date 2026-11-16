import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api } from "../src/api/client";
import { colors, spacing } from "../src/theme";
import VerifiedBadge from "../src/components/VerifiedBadge";

/**
 * Live Chat, matching the web page (frontend/src/pages/LiveChatPage.jsx):
 * GET /livechat, POST /livechat {text}.
 */
type ChatMessage = { id?: string; text?: string; message?: string; user?: any; author?: any; sender?: any; created_at?: string };

export default function LiveChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const load = useCallback(async () => {
    try { const res = await api.get<any>("/livechat", false); setMessages(Array.isArray(res) ? res : res.messages || res.items || []); } catch { setMessages([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);
  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try { await api.post("/livechat", { text: text.trim() }); setText(""); await load(); } catch (e: any) { } finally { setSending(false); }
  };
  const authorOf = (m: ChatMessage) => m.user || m.author || m.sender || {};
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Live Chat" }} />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : (
        <FlatList ref={listRef} data={messages} keyExtractor={(m, i) => m.id || String(i)} style={styles.list} contentContainerStyle={{ paddingBottom: 12 }} renderItem={({ item }) => { const a = authorOf(item); return (<View style={styles.msg}><View style={styles.msgHeader}><Text style={styles.author}>{a.display_name || a.username || "Someone"}</Text><VerifiedBadge user={a} size={12} /></View><Text style={styles.text}>{item.text || item.message || ""}</Text></View>); }} />
      )}
      <View style={styles.inputRow}>
        <TextInput style={styles.input} placeholder="Say something..." placeholderTextColor={colors.textMuted} value={text} onChangeText={setText} testID="livechat-input" />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={sending} testID="livechat-send"><Text style={styles.sendText}>Send</Text></TouchableOpacity>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1, padding: spacing.md },
  msg: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, marginBottom: 8 },
  msgHeader: { flexDirection: "row", alignItems: "center", gap: 5 },
  author: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  text: { color: colors.textPrimary, fontSize: 14, marginTop: 4 },
  inputRow: { flexDirection: "row", gap: 8, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10 },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  sendText: { color: "#FFFFFF", fontWeight: "700" },
});
