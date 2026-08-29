import React from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii } from "@/src/theme";
import { StoryUser } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";

interface Props {
  users: StoryUser[];
}

const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

export function StoryBar({ users }: Props) {
  const router = useRouter();
  const { user: me } = useAuth();

  // Always show "Your story" first. If the user already has an active story
  // it'll arrive in the `users` payload with is_me=true; otherwise we render
  // a synthetic placeholder that opens the story creator.
  const myStory = users.find((u) => u.is_me);
  const others = users.filter((u) => !u.is_me);
  const items: Array<StoryUser & { isCreatePlaceholder?: boolean }> = [
    myStory ?? {
      user_id: me?.id ?? "me",
      username: me?.username ?? "you",
      display_name: "Your story",
      avatar_url: me?.avatar_url ?? FALLBACK_AVATAR,
      is_verified: !!me?.is_verified,
      preview_url: "",
      count: 0,
      seen: false,
      is_me: true,
      isCreatePlaceholder: true,
    },
    ...others,
  ];

  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(u) => u.user_id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isMine = item.is_me;
          const hasStory = item.count > 0;
          const showCreatePlus = isMine && (item.isCreatePlaceholder || !hasStory);
          return (
            <TouchableOpacity
              style={styles.item}
              activeOpacity={0.85}
              onPress={() => {
                if (isMine && !hasStory) {
                  // No story yet → open creator
                  router.push("/story/create");
                } else {
                  // Either someone else, OR self with an existing story → open viewer
                  router.push(`/story/${item.user_id}`);
                }
              }}
              onLongPress={() => {
                if (isMine && hasStory) router.push("/story/create");
              }}
              testID={isMine ? "story-self" : `story-avatar-${item.username}`}
            >
              <View
                style={[
                  styles.ring,
                  hasStory && !item.seen && styles.ringStory,
                  hasStory && item.seen && styles.ringSeen,
                ]}
              >
                <View style={styles.ringInner}>
                  <Image
                    source={{ uri: item.avatar_url || FALLBACK_AVATAR }}
                    style={styles.avatar}
                  />
                  {showCreatePlus && (
                    <View style={styles.plus}>
                      <Ionicons name="add" size={14} color={colors.bg} />
                    </View>
                  )}
                </View>
              </View>
              <Text style={styles.username} numberOfLines={1}>
                {isMine ? "Your story" : item.display_name}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  list: { paddingHorizontal: spacing.md, gap: spacing.md },
  item: { alignItems: "center", width: 74 },
  ring: {
    width: 70,
    height: 70,
    borderRadius: 35,
    padding: 3,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  ringStory: { backgroundColor: colors.primary },
  ringSeen: { backgroundColor: colors.textMuted },
  ringInner: {
    width: "100%",
    height: "100%",
    borderRadius: 32,
    backgroundColor: colors.bg,
    padding: 2,
    position: "relative",
  },
  avatar: { width: "100%", height: "100%", borderRadius: 30 },
  plus: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.bg,
  },
  username: { color: colors.textPrimary, fontSize: 12, fontWeight: "600", marginTop: 6, maxWidth: 74 },
  _unused: { borderRadius: radii.sm }, // keep radii import used
});
