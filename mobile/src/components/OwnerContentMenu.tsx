import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, FeedItem } from "@/src/api/client";
import { colors, spacing } from "@/src/theme";
import { EditContentSheet } from "@/src/components/EditContentSheet";

interface Props {
  item: FeedItem;
  onChange?: (updated: FeedItem) => void;
  onDeleted?: (id: string) => void;
  color?: string; // icon tint (light for dark thumbnails)
}

// Three-dots owner menu offering Edit + Delete for a post/reel/video feed card.
export function OwnerContentMenu({ item, onChange, onDeleted, color = colors.textSecondary }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isVideo = item.type === "video";
  const label = isVideo ? "video" : item.type === "reel" ? "reel" : "post";
  const deletePath = isVideo ? `/videos/${item.id}` : `/posts/${item.id}`;

  const confirmDelete = () => {
    setMenuOpen(false);
    Alert.alert(`Delete ${label}?`, "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await api.del(deletePath);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            onDeleted?.(item.id);
          } catch (e: any) {
            Alert.alert("Couldn't delete", e?.message ?? "Try again.");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setMenuOpen(true)}
        disabled={deleting}
        hitSlop={8}
        testID={`owner-menu-${item.id}`}
        style={styles.trigger}
      >
        {deleting ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Ionicons name="ellipsis-horizontal" size={18} color={color} />
        )}
      </TouchableOpacity>

      <Modal visible={menuOpen} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setMenuOpen(false)} />
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <View style={styles.grabber} />
            <TouchableOpacity
              style={styles.item}
              onPress={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
              testID={`owner-edit-${item.id}`}
            >
              <Ionicons name="create-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.itemText}>Edit {label}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.item} onPress={confirmDelete} testID={`owner-delete-${item.id}`}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
              <Text style={[styles.itemText, { color: colors.danger }]}>Delete {label}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancel} onPress={() => setMenuOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      <EditContentSheet
        item={editing ? item : null}
        visible={editing}
        onClose={() => setEditing(false)}
        onSaved={(u) => onChange?.(u)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { padding: 4, minWidth: 28, alignItems: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingBottom: spacing.sm,
  },
  grabber: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 8, marginBottom: spacing.sm },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemText: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  cancel: { paddingVertical: 14, alignItems: "center", marginTop: spacing.sm },
  cancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: "700" },
});
