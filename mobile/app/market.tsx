import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api, type StoreItem } from "../src/api/client";
import { colors, spacing } from "../src/theme";

/**
 * Market, matching the web page (frontend/src/pages/Market.jsx):
 * GET /store/items, buy POST /market/store/buy {item_id}.
 */
export default function MarketScreen() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get<any>("/store/items"); setItems(Array.isArray(res) ? res : res.items || []); } catch { setItems([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const buy = async (item: StoreItem) => {
    setBusyId(item.id);
    try { await api.post("/market/store/buy", { item_id: item.id }); Alert.alert("Market", "Purchase complete."); await load(); } catch (e: any) { Alert.alert("Market", e?.message || "Purchase failed"); } finally { setBusyId(null); }
  };
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Market" }} />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
          {items.length === 0 ? <Text style={styles.empty}>Nothing in the market right now.</Text> : items.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.name}>{item.name || item.id}</Text>
              {item.blurb ? <Text style={styles.meta}>{item.blurb}</Text> : null}
              <View style={styles.row}><Text style={styles.price}>{item.price} tokens</Text><TouchableOpacity style={styles.btn} onPress={() => buy(item)} disabled={busyId === item.id}><Text style={styles.btnText}>Buy</Text></TouchableOpacity></View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  scroll: { flex: 1 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  price: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  btn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  btnText: { color: "#FFFFFF", fontWeight: "700" },
  empty: { color: colors.textSecondary, fontSize: 14, marginTop: 16 },
});
