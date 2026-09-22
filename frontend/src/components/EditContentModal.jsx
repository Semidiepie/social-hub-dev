import React, { useEffect, useRef, useState } from "react";
import { Loader2, ImagePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { toast } from "sonner";

// Reusable owner-edit dialog for posts, reels and videos.
// - post / reel: caption + game tag (media unchanged)
// - video: title, description, category, tags, visibility + thumbnail replace
export function EditContentModal({ item, open, onClose, onSaved }) {
  const isVideo = item?.type === "video";
  const [saving, setSaving] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const fileRef = useRef(null);

  const [caption, setCaption] = useState("");
  const [gameTag, setGameTag] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [thumbUrl, setThumbUrl] = useState("");

  useEffect(() => {
    if (!item) return;
    setCaption(item.caption || "");
    setGameTag(item.game_tag || "");
    setTitle(item.title || "");
    setDescription(item.description || "");
    setCategory(item.category || item.game_tag || "");
    setTags(Array.isArray(item.tags) ? item.tags.join(", ") : "");
    setVisibility(item.visibility || "public");
    setThumbUrl(item.thumbnail_url || "");
  }, [item]);

  const pickThumbnail = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingThumb(true);
    try {
      const result = await uploadToCloudinary(file, { resourceType: "image" });
      setThumbUrl(result.secure_url);
      toast.success("Thumbnail updated");
    } catch (err) {
      toast.error(err.message || "Thumbnail upload failed");
    } finally {
      setUploadingThumb(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    if (!item) return;
    setSaving(true);
    try {
      let updated;
      if (isVideo) {
        updated = await api.put(`/videos/${item.id}`, {
          title: title.trim(),
          description: description.trim(),
          category: category.trim() || null,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          visibility,
          thumbnail_url: thumbUrl || null,
        });
      } else {
        updated = await api.put(`/posts/${item.id}`, {
          caption: caption.trim(),
          game_tag: gameTag.trim() || null,
        });
      }
      toast.success("Changes saved");
      onSaved?.(updated);
      onClose?.();
    } catch (err) {
      toast.error(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-lg" data-testid="edit-content-modal">
        <DialogHeader>
          <DialogTitle>
            Edit {isVideo ? "video" : item?.type === "reel" ? "reel" : "post"}
          </DialogTitle>
        </DialogHeader>

        {isVideo ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Video title"
                data-testid="edit-video-title"
              />
            </div>
            <div>
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Describe your video"
                data-testid="edit-video-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-category">Category</Label>
                <Input
                  id="edit-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Gaming"
                  data-testid="edit-video-category"
                />
              </div>
              <div>
                <Label htmlFor="edit-visibility">Visibility</Label>
                <select
                  id="edit-visibility"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
                  data-testid="edit-video-visibility"
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="edit-tags">Tags (comma separated)</Label>
              <Input
                id="edit-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="fps, tutorial, funny"
                data-testid="edit-video-tags"
              />
            </div>
            <div>
              <Label>Thumbnail</Label>
              <div className="mt-1 flex items-center gap-3">
                <div className="h-20 w-32 overflow-hidden rounded-lg bg-secondary">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No thumbnail
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={pickThumbnail}
                  className="hidden"
                  data-testid="edit-video-thumb-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingThumb}
                  className="gap-2"
                  data-testid="edit-video-thumb-btn"
                >
                  {uploadingThumb ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                  Replace
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-caption">Caption</Label>
              <Textarea
                id="edit-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                placeholder="Write a caption"
                data-testid="edit-post-caption"
              />
            </div>
            <div>
              <Label htmlFor="edit-gametag">Game tag (optional)</Label>
              <Input
                id="edit-gametag"
                value={gameTag}
                onChange={(e) => setGameTag(e.target.value)}
                placeholder="e.g. Valorant"
                data-testid="edit-post-gametag"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} data-testid="edit-cancel-btn">
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || uploadingThumb}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="edit-save-btn"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
