import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api } from "../src/api/client";
import { colors, spacing } from "../src/theme";

/**
 * Games, matching the web page (frontend/src/pages/GamesHub.jsx):
 * GET /games and GET /games/recent. The side menu only shows Games when
 * GET /games/count returns more than zero.
 */
type Game = { id: string; title?: string; name?: string; description?: string; url?: string; [k: string]: any };

export default function GamesScreen() {
  const [games, setGames] = useState<Game[]>([]);
  const [recent, setRecent] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, rec] = await Promise.all([api.get<any>("/games"), api.get<any>("/games/recent").catch(() => [])]);
      setGames(Array.isArray(list) ? list : list.games || list.items || []);
      setRecent(Array.isArray(rec) ? rec : rec.games || rec.items || []);
    } catch { setGames([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const play = (g: Game) => {
    if (g.url) Linking.openURL(g.url).catch(() => Alert.alert("Games", "Could not open this game."));
    else Alert.alert(g.title || g.name || "Game", g.description || "This game opens on the web.");
  };
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Games" }} />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
          {recent.length > 0 && (<><Text style={styles.section}>Recently played</Text>{recent.map((g) => (<TouchableOpacity key={g.id} style={styles.card} onPress={() => play(g)}><Text style={styles.name}>{g.title || g.name || g.id}</Text></TouchableOpacity>))}</>)}
          <Text style={styles.section}>All games</Text>
          {games.length === 0 ? <Text style={styles.empty}>No games yet.</Text> : games.map((g) => (
            <TouchableOpacity key={g.id} style={styles.card} onPress={() => play(g)} testID={`game-${g.id}`}>
              <Text style={styles.name}>{g.title || g.name || g.id}</Text>
              {g.description ? <Text style={styles.meta}>{g.description}</Text> : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  scroll: { flex: 1 },
  section: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  empty: { color: colors.textSecondary, fontSize: 14 },
});
