// Blog composer — create OR edit a blog with markdown + live preview.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputSelectionChangeEventData,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, Blog } from "@/src/api/client";
import { renderMarkdownToBlocks } from "@/src/lib/mdRender";
import { uploadToCloudinary, isCloudinaryConfigured } from "@/src/lib/cloudinary";
import { colors, radii, spacing } from "@/src/theme";
import { CONTENT_MAX_WIDTH, useResponsive } from "@/src/hooks/useResponsive";

export default function BlogComposer() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id;
  const { isDesktop } = useResponsive();

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [uploadingImage, setUploadingImage] = useState<"cover" | "body" | null>(null);
  const bodyRef = useRef<TextInput>(null);

  const insertAtCursor = useCallback(
    (snippet: string) => {
      setBodyMd((prev) => {
        const start = Math.max(0, Math.min(selection.start, prev.length));
        const end = Math.max(start, Math.min(selection.end, prev.length));
        const next = prev.slice(0, start) + snippet + prev.slice(end);
        const cursor = start + snippet.length;
        // Move the caret to just after the inserted snippet.
        setTimeout(() => {
          try {
            bodyRef.current?.setNativeProps({ selection: { start: cursor, end: cursor } });
          } catch {
            // best effort
          }
        }, 30);
        setSelection({ start: cursor, end: cursor });
        return next;
      });
    },
    [selection],
  );

  const pickAndUpload = useCallback(
    async (target: "cover" | "body") => {
      setError(null);
      if (!isCloudinaryConfigured()) {
        setError("Image uploads aren't configured yet.");
        return;
      }
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          if (!perm.canAskAgain) {
            setError("Photo access is blocked. Enable it in Settings to add images.");
          } else {
            setError("Photo access is needed to pick an image.");
          }
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          allowsMultipleSelection: false,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        setUploadingImage(target);
        try {
          const url = await uploadToCloudinary(asset.uri, "image", asset.mimeType || null);
          if (target === "cover") {
            setCoverUrl(url);
          } else {
            insertAtCursor(`\n![](${url})\n`);
          }
        } catch (e: any) {
          setError(e?.message || "Image upload failed. Try again.");
        }
      } catch (e: any) {
        setError(e?.message || "Could not pick image.");
      } finally {
        setUploadingImage(null);
      }
    },
    [insertAtCursor],
  );

  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const rows = await api.get<Blog[]>("/blogs/mine");
        const b = rows.find((x) => x.id === editId);
        if (b) {
          setTitle(b.title);
          setSubtitle(b.subtitle);
          setCoverUrl(b.cover_url);
          setBodyMd(b.body_md);
          setTags(b.tags.join(", "));
        } else {
          setError("Blog not found");
        }
      } catch (e: any) {
        setError(e?.message || "Could not load blog");
      } finally {
        setLoading(false);
      }
    })();
  }, [editId]);

  const save = useCallback(
    async (status: "draft" | "published") => {
      setError(null);
      if (title.trim().length < 3) {
        setError("Title must be at least 3 characters.");
        return;
      }
      if (bodyMd.trim().length < 10) {
        setError("Write at least 10 characters.");
        return;
      }
      setBusy(true);
      try {
        const payload = {
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          cover_url: coverUrl.trim() || null,
          body_md: bodyMd,
          status,
          tags: tags
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 10),
        };
        const saved = editId
          ? await api.put<Blog>(`/blogs/${editId}`, payload)
          : await api.post<Blog>("/blogs", payload);
        if (status === "published") {
          router.replace(`/blogs/${saved.id}`);
        } else {
          if (Platform.OS === "web") {
            if (typeof window !== "undefined") window.alert("Saved as draft ✓");
          } else {
            Alert.alert("Saved as draft");
          }
          router.replace("/blogs/mine");
        }
      } catch (e: any) {
        setError(e?.message || "Could not save.");
      } finally {
        setBusy(false);
      }
    },
    [title, subtitle, coverUrl, bodyMd, tags, editId, router],
  );

  const previewBlocks = useMemo(() => renderMarkdownToBlocks(bodyMd), [bodyMd]);

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.tabRow}>
            <Pressable onPress={() => setTab("write")} style={[styles.tab, tab === "write" && styles.tabActive]}>
              <Text style={[styles.tabText, tab === "write" && styles.tabTextActive]}>Write</Text>
            </Pressable>
            <Pressable onPress={() => setTab("preview")} style={[styles.tab, tab === "preview" && styles.tabActive]}>
              <Text style={[styles.tabText, tab === "preview" && styles.tabTextActive]}>Preview</Text>
            </Pressable>
          </View>
          <TouchableOpacity
            onPress={() => save("published")}
            style={[styles.publish, busy && { opacity: 0.6 }]}
            disabled={busy}
            testID="blog-publish"
          >
            {busy ? <ActivityIndicator size="small" color="#fff" /> : (
              <Text style={styles.publishText}>Publish</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {tab === "write" ? (
          <ScrollView
            contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl * 2 }}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={colors.textMuted}
              style={styles.titleInput}
              multiline
              maxLength={180}
              testID="blog-title"
            />
            <TextInput
              value={subtitle}
              onChangeText={setSubtitle}
              placeholder="Subtitle (optional)"
              placeholderTextColor={colors.textMuted}
              style={styles.subtitleInput}
              multiline
              maxLength={240}
              testID="blog-subtitle"
            />
            <View style={styles.coverRow}>
              <TextInput
                value={coverUrl}
                onChangeText={setCoverUrl}
                placeholder="Cover image URL (optional)"
                placeholderTextColor={colors.textMuted}
                style={[styles.metaInput, { flex: 1 }]}
                autoCapitalize="none"
                testID="blog-cover"
              />
              <TouchableOpacity
                onPress={() => pickAndUpload("cover")}
                disabled={!!uploadingImage}
                style={styles.coverPickBtn}
                testID="blog-cover-pick"
              >
                {uploadingImage === "cover" ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="image" size={16} color={colors.primary} />
                    <Text style={styles.coverPickText}>
                      {coverUrl ? "Change" : "Pick"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            {!!coverUrl && (
              <Text style={styles.coverHint} numberOfLines={1}>
                {coverUrl}
              </Text>
            )}
            <TextInput
              value={tags}
              onChangeText={setTags}
              placeholder="Tags, comma-separated"
              placeholderTextColor={colors.textMuted}
              style={styles.metaInput}
              autoCapitalize="none"
              testID="blog-tags"
            />
            <MarkdownToolbar
              onInsert={insertAtCursor}
              onPickImage={() => pickAndUpload("body")}
              uploading={uploadingImage === "body"}
            />
            <TextInput
              ref={bodyRef}
              value={bodyMd}
              onChangeText={setBodyMd}
              onSelectionChange={(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) =>
                setSelection(e.nativeEvent.selection)
              }
              placeholder="Write your story…

# Big heading
## Subheading

**bold** *italic* > quote

- bulleted lists
1. numbered lists

`inline code`

```js
code block
```

[link text](https://example.com)
![image alt](https://example.com/img.jpg)
"
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.bodyInput}
              textAlignVertical="top"
              testID="blog-body"
            />
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.footerActions}>
              <TouchableOpacity
                onPress={() => save("draft")}
                style={styles.draftBtn}
                disabled={busy}
                testID="blog-save-draft"
              >
                <Ionicons name="save-outline" size={16} color={colors.textPrimary} />
                <Text style={styles.draftBtnText}>Save draft</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
            {!!coverUrl && (
              <View style={styles.previewCoverWrap}>
                <View style={styles.previewCoverInner}>
                  <PreviewImage uri={coverUrl} />
                </View>
              </View>
            )}
            <Text style={styles.previewTitle}>{title || "Untitled"}</Text>
            {!!subtitle && <Text style={styles.previewSubtitle}>{subtitle}</Text>}
            <View style={{ marginTop: spacing.md }}>
              {previewBlocks.length === 0 ? (
                <Text style={styles.previewPlaceholder}>Nothing to preview yet.</Text>
              ) : (
                previewBlocks
              )}
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      </View>
    </View>
  );
}

function PreviewImage({ uri }: { uri: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  // Use plain img on web for URLs with no CORS setup; on native use Image.
  if (Platform.OS === "web") {
    return (
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      <img
        src={uri}
        onError={() => setOk(false)}
        style={{ width: "100%", height: 180, objectFit: "cover" }}
      />
    );
  }
  const { Image: RNImage } = require("react-native");
  return (
    <RNImage
      source={{ uri }}
      style={{ width: "100%", height: 180 }}
      onError={() => setOk(false)}
      resizeMode="cover"
    />
  );
}

function MarkdownToolbar({
  onInsert,
  onPickImage,
  uploading,
}: {
  onInsert: (s: string) => void;
  onPickImage: () => void;
  uploading: boolean;
}) {
  const items: { icon: keyof typeof Ionicons.glyphMap; insert: string; label: string }[] = [
    { icon: "text", insert: "\n# Heading\n", label: "H1" },
    { icon: "text", insert: "\n## Sub-heading\n", label: "H2" },
    { icon: "flame", insert: "**bold**", label: "B" },
    { icon: "code-slash", insert: "`code`", label: "code" },
    { icon: "link", insert: "[title](https://)", label: "link" },
    { icon: "list", insert: "\n- item\n- item\n", label: "list" },
    { icon: "chatbubble-outline", insert: "\n> quote\n", label: "quote" },
  ];
  return (
    <View style={styles.toolbar}>
      {items.map((it) => (
        <Pressable key={it.label} onPress={() => onInsert(it.insert)} style={styles.toolbarBtn}>
          <Ionicons name={it.icon} size={16} color={colors.primary} />
          <Text style={styles.toolbarText}>{it.label}</Text>
        </Pressable>
      ))}
      <Pressable
        onPress={onPickImage}
        disabled={uploading}
        style={[styles.toolbarBtn, styles.toolbarImageBtn]}
        testID="blog-body-image-pick"
      >
        {uploading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="image" size={16} color="#fff" />
            <Text style={[styles.toolbarText, { color: "#fff" }]}>Add image</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: 4,
  },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radii.full, padding: 3 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radii.full },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: "800", fontSize: 12 },
  tabTextActive: { color: "#fff" },
  publish: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  publishText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  titleInput: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "900",
    padding: 0,
    marginBottom: spacing.sm,
  },
  subtitleInput: {
    color: colors.textSecondary,
    fontSize: 16,
    padding: 0,
    marginBottom: spacing.md,
  },
  metaInput: {
    color: colors.textPrimary,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 8,
    marginBottom: spacing.sm,
    fontSize: 14,
  },
  coverRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  coverPickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderColor: colors.primary,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.full,
    marginBottom: spacing.sm,
  },
  coverPickText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  coverHint: { color: colors.textMuted, fontSize: 11, marginTop: -4, marginBottom: spacing.sm },

  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  toolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  toolbarImageBtn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toolbarText: { color: colors.primary, fontSize: 11, fontWeight: "800" },

  bodyInput: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 320,
    padding: 0,
  },
  errorText: { color: colors.danger, fontSize: 13, marginTop: 10 },

  footerActions: { flexDirection: "row", marginTop: spacing.lg, gap: 10 },
  draftBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.full,
  },
  draftBtnText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },

  previewCoverWrap: { marginBottom: spacing.md },
  previewCoverInner: { borderRadius: radii.md, overflow: "hidden" },
  previewTitle: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 8,
  },
  previewSubtitle: { color: colors.textSecondary, fontSize: 16, marginBottom: spacing.md },
  previewPlaceholder: { color: colors.textMuted, fontSize: 14, fontStyle: "italic" },
});
