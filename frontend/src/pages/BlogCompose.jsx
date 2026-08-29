import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Save, Send, Image as ImageIcon, Eye, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { uploadToCloudinary, cloudinaryAvailable } from "@/lib/cloudinary";
import { useAuth } from "@/context/AuthContext";

const emptyBlog = {
  title: "",
  subtitle: "",
  cover_url: "",
  body_md: "",
  tags: [],
  status: "draft",
};

export default function BlogComposePage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(emptyBlog);
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!isEdit) return;
    try {
      const b = await api.get(`/blogs/${id}`);
      setForm({
        title: b.title,
        subtitle: b.subtitle,
        cover_url: b.cover_url,
        body_md: b.body_md,
        tags: b.tags || [],
        status: b.status,
      });
    } catch (e) {
      toast.error(e.message || "Failed to load draft");
      navigate("/blogs");
    } finally {
      setLoading(false);
    }
  }, [id, isEdit, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Redirect guests to login
    if (!user && !loading) navigate("/login");
  }, [user, loading, navigate]);

  const patch = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t) return;
    if (form.tags.includes(t)) return setTagInput("");
    if (form.tags.length >= 10) return toast.error("Max 10 tags");
    setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    setTagInput("");
  };

  const removeTag = (t) => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }));

  const handleCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!cloudinaryAvailable) {
      toast.error("Uploads aren't configured. Paste a cover URL instead.");
      return;
    }
    setUploading(true);
    try {
      const result = await uploadToCloudinary(file, { resourceType: "image" });
      setForm((f) => ({ ...f, cover_url: result.secure_url }));
      toast.success("Cover uploaded");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async (status) => {
    if (form.title.trim().length < 1) return toast.error("Title required");
    if (form.body_md.trim().length < 1) return toast.error("Body required");
    setBusy(true);
    try {
      const payload = { ...form, status };
      if (isEdit) {
        const updated = await api.put(`/blogs/${id}`, payload);
        toast.success(status === "published" ? "Published!" : "Draft saved");
        navigate(status === "published" ? `/blogs/${updated.id}` : "/blogs");
      } else {
        const created = await api.post("/blogs", payload);
        toast.success(status === "published" ? "Published!" : "Draft saved");
        navigate(status === "published" ? `/blogs/${created.id}` : "/blogs");
      }
    } catch (e) {
      toast.error(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl" data-testid="blog-compose">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">{isEdit ? "Edit blog" : "New blog"}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => save("draft")}
            disabled={busy}
            data-testid="blog-save-draft"
            className="gap-2"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save draft
          </Button>
          <Button
            onClick={() => save("published")}
            disabled={busy}
            data-testid="blog-publish"
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Publish
          </Button>
        </div>
      </header>

      <div className="space-y-5">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={form.title}
            onChange={patch("title")}
            maxLength={180}
            required
            data-testid="blog-title-input"
            className="mt-1.5 h-12 text-lg font-bold"
            placeholder="A killer headline"
          />
        </div>
        <div>
          <Label htmlFor="subtitle">Subtitle (optional)</Label>
          <Input
            id="subtitle"
            value={form.subtitle}
            onChange={patch("subtitle")}
            maxLength={240}
            data-testid="blog-subtitle-input"
            className="mt-1.5 h-11"
            placeholder="One-line hook"
          />
        </div>

        <div>
          <Label>Cover image</Label>
          {form.cover_url ? (
            <div className="relative mt-1.5 overflow-hidden rounded-2xl border border-border">
              <img src={form.cover_url} alt="" className="aspect-[16/9] w-full object-cover" />
              <button
                onClick={() => setForm((f) => ({ ...f, cover_url: "" }))}
                className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white hover:bg-black"
                data-testid="blog-remove-cover"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <label
              htmlFor="cover-upload"
              className="mt-1.5 flex aspect-[16/9] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/40 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
              data-testid="blog-cover-drop"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  Uploading…
                </>
              ) : (
                <>
                  <ImageIcon size={22} />
                  Click to upload a cover image
                </>
              )}
              <input
                id="cover-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCover}
              />
            </label>
          )}
          <div className="mt-2">
            <Input
              placeholder="…or paste an image URL"
              value={form.cover_url}
              onChange={patch("cover_url")}
              data-testid="blog-cover-url-input"
              className="h-9 text-xs"
            />
          </div>
        </div>

        <div>
          <Label>Body (Markdown)</Label>
          <Tabs defaultValue="write" className="mt-1.5">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="write" data-testid="blog-tab-write">
                Write
              </TabsTrigger>
              <TabsTrigger value="preview" data-testid="blog-tab-preview">
                <Eye size={14} className="mr-1.5" /> Preview
              </TabsTrigger>
            </TabsList>
            <TabsContent value="write">
              <Textarea
                value={form.body_md}
                onChange={patch("body_md")}
                data-testid="blog-body-input"
                className="min-h-[420px] font-mono text-sm"
                placeholder="# Section header

Write your story in Markdown."
              />
            </TabsContent>
            <TabsContent value="preview">
              <div className="prose-postme min-h-[420px] rounded-2xl border border-border bg-card p-6">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {form.body_md || "*Nothing to preview yet.*"}
                </ReactMarkdown>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div>
          <Label>Tags</Label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {form.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                #{t}
                <button onClick={() => removeTag(t)} className="hover:text-primary-foreground">
                  <X size={11} />
                </button>
              </span>
            ))}
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="Add tag + Enter"
              data-testid="blog-tag-input"
              className="h-8 w-40 text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
