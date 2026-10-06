import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, WalletInfo, StoreItem } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing } from "@/src/theme";

const FRAME_COLORS: Record<string, string> = {
  violet: "#8b5cf6",
  ocean: "#2193b0",
  frost: "#7ee8fa",
  neon: "#ff00ff",
  fire: "#ff512f",
  aurora: "#00d4ff",
  sunset: "#ff2e63",
  rainbow: "#33ff00",
  molten: "#ff8c00",
  galaxy: "#7b2ff7",
};

const KIND_LABEL: Record<string, string> = {
  daily: "Daily reward",
  game: "Game reward",
  admin_grant: "Admin grant",
  purchase: "Store purchase",
  gift_sent: "Gift sent",
  gift_received: "Gift received",
  transfer_sent: "Transfer sent",
  transfer_received: "Transfer received",
};

export default function WalletScreen() {
  const router = useRouter();
  const { user, patchUser } = useAuth();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [store, setStore] = useState<{ balance: number; items: StoreItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [toUser, setToUser] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [w, s] = await Promise.all([
        api.get<WalletInfo>("/wallet"),
        api.get<{ balance: number; items: StoreItem[] }>("/store/items"),
      ]);
      setWallet(w);
      setStore(s);
      patchUser({ tokens: w.balance });
    } catch (e) {
      console.warn("wallet load", e);
    }
  }, [patchUser]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const claimDaily = async () => {
    setBusy("daily");
    try {
      await api.post("/wallet/daily");
      await load();
    } catch {
      /* already claimed */
    } finally {
      setBusy("");
    }
  };

  const buy = async (item: StoreItem) => {
    setBusy(`buy-${item.id}`);
    try {
      const updated = await api.post<any>("/store/buy", { item_id: item.id });
      patchUser(updated);
      await load();
    } catch (e: any) {
      console.warn("buy", e?.message);
    } finally {
      setBusy("");
    }
  };

  const transfer = async () => {
    const amt = parseInt(amount, 10);
    if (!toUser.trim() || !amt || amt < 1) return;
    setBusy("transfer");
    try {
      await api.post("/wallet/transfer", { username: toUser.trim(), amount: amt, note });
      setToUser("");
      setAmount("");
      setNote("");
      await load();
    } catch (e: any) {
      console.warn("transfer", e?.message);
    } finally {
      setBusy("");
    }
  };

  const balance = wallet?.balance ?? user?.tokens ?? 0;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="wallet-back">
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Wallet</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Balance card */}
          <LinearGradient
            colors={[colors.primaryMuted, "rgba(255,107,61,0.04)"]}
            style={styles.balanceCard}
          >
            <Text style={styles.balanceLabel}>YOUR BALANCE</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceValue} testID="wallet-balance">{balance}</Text>
              <Text style={styles.balanceUnit}>tokens</Text>
            </View>
            <TouchableOpacity
              style={[styles.claimBtn, (!wallet?.can_claim_daily || busy === "daily") && styles.btnDisabled]}
              disabled={!wallet?.can_claim_daily || busy === "daily"}
              onPress={claimDaily}
              testID="wallet-claim-daily"
            >
              <Ionicons name="gift-outline" size={16} color={colors.bg} />
              <Text style={styles.claimBtnText}>
                {!wallet?.can_claim_daily ? "Daily reward claimed" : busy === "daily" ? "Claiming…" : `Claim daily +${wallet?.daily_reward ?? 25}`}
              </Text>
            </TouchableOpacity>
          </LinearGradient>

          {/* E-transfer */}
          <Text style={styles.sectionTitle}>E-transfer tokens</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="Recipient username"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              value={toUser}
              onChangeText={setToUser}
              testID="transfer-username"
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput
                style={[styles.input, { width: 110 }]}
                placeholder="Amount"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))}
                testID="transfer-amount"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Note (optional)"
                placeholderTextColor={colors.textSecondary}
                value={note}
                onChangeText={setNote}
                maxLength={120}
                testID="transfer-note"
              />
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, busy === "transfer" && styles.btnDisabled]}
              disabled={busy === "transfer"}
              onPress={transfer}
              testID="transfer-submit"
            >
              <Ionicons name="paper-plane-outline" size={16} color={colors.bg} />
              <Text style={styles.primaryBtnText}>{busy === "transfer" ? "Sending…" : "Send tokens"}</Text>
            </TouchableOpacity>
          </View>

          {/* Store */}
          <Text style={styles.sectionTitle}>Token Store — Premium Frames</Text>
          <View style={styles.storeGrid}>
            {(store?.items || []).map((item) => {
              const ring = FRAME_COLORS[item.id] || colors.primary;
              const affordable = balance >= item.price;
              return (
                <View key={item.id} style={styles.storeItem} testID={`store-frame-${item.id}`}>
                  <View style={[styles.framePreview, { borderColor: ring, shadowColor: ring }]}>
                    <Image source={{ uri: user?.avatar_url }} style={styles.frameAvatar} contentFit="cover" />
                  </View>
                  <Text style={styles.frameName}>{item.name}</Text>
                  {item.owned ? (
                    <View style={styles.ownedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                      <Text style={styles.ownedText}>Owned</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.buyBtn, (!affordable || busy === `buy-${item.id}`) && styles.btnDisabled]}
                      disabled={!affordable || busy === `buy-${item.id}`}
                      onPress={() => buy(item)}
                      testID={`store-frame-buy-${item.id}`}
                    >
                      <Ionicons name={affordable ? "server-outline" : "lock-closed"} size={13} color={colors.bg} />
                      <Text style={styles.buyBtnText}>{busy === `buy-${item.id}` ? "…" : item.price}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          {/* History */}
          <Text style={styles.sectionTitle}>Recent activity</Text>
          {(wallet?.transactions.length ?? 0) === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No transactions yet. Claim your daily reward to start earning!</Text>
            </View>
          ) : (
            wallet!.transactions.map((t) => {
              const pos = t.amount >= 0;
              return (
                <View key={t.id} style={styles.txRow}>
                  <View style={[styles.txIcon, { backgroundColor: pos ? "rgba(52,199,89,0.15)" : "rgba(255,59,48,0.15)" }]}>
                    <Ionicons name={pos ? "arrow-down" : "arrow-up"} size={15} color={pos ? "#34C759" : colors.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txLabel}>{KIND_LABEL[t.kind] || t.kind}</Text>
                    {!!t.note && <Text style={styles.txNote} numberOfLines={1}>{t.note}</Text>}
                  </View>
                  <Text style={[styles.txAmount, { color: pos ? "#34C759" : colors.danger }]}>
                    {pos ? "+" : ""}{t.amount}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: 10 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  balanceCard: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.primaryMuted },
  balanceLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.textSecondary },
  balanceRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 4 },
  balanceValue: { fontSize: 44, fontWeight: "900", color: colors.textPrimary },
  balanceUnit: { fontSize: 18, fontWeight: "900", color: colors.primary, marginBottom: 7 },
  claimBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 11, marginTop: 14 },
  claimBtnText: { color: colors.bg, fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.45 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, marginTop: 24, marginBottom: 10 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: colors.textPrimary, fontSize: 14 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, marginTop: 10 },
  primaryBtnText: { color: colors.bg, fontWeight: "800", fontSize: 14 },
  storeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  storeItem: { width: "31%", alignItems: "center", backgroundColor: colors.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.border },
  framePreview: { width: 60, height: 60, borderRadius: 30, borderWidth: 3, alignItems: "center", justifyContent: "center", shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  frameAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border },
  frameName: { fontSize: 12, fontWeight: "700", color: colors.textPrimary, marginTop: 8, textAlign: "center" },
  buyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, marginTop: 8 },
  buyBtnText: { color: colors.bg, fontWeight: "800", fontSize: 13 },
  ownedBadge: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 8, paddingVertical: 6 },
  ownedText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  emptyCard: { borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: 16, padding: 24 },
  emptyText: { color: colors.textSecondary, textAlign: "center", fontSize: 13 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  txIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  txLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  txNote: { fontSize: 12, color: colors.textSecondary },
  txAmount: { fontSize: 15, fontWeight: "900" },
});
