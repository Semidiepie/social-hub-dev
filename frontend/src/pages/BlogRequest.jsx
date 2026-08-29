import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Send } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function BlogRequestPage() {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 10) {
      toast.error("Tell us a bit more (min 10 characters).");
      return;
    }
    setBusy(true);
    try {
      await api.post("/blogs/request-permission", { reason: reason.trim() });
      toast.success("Request sent — we'll review soon.");
      navigate("/blogs");
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg" data-testid="blog-request-form">
      <h1 className="text-3xl font-black tracking-tight">Request to publish</h1>
      <p className="mt-1 text-muted-foreground">
        PostMePlex reviews publishers to keep quality high. Tell us what you plan
        to write about and we'll get back to you.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <Label>Why should we approve you?</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1.5 min-h-[160px]"
            placeholder="Topics you write about, portfolio links, community you serve…"
            maxLength={500}
            required
            data-testid="blog-request-reason"
          />
          <div className="mt-1 text-right text-xs text-muted-foreground">{reason.length}/500</div>
        </div>
        <Button
          type="submit"
          disabled={busy}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="blog-request-submit"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send request
        </Button>
      </form>
    </div>
  );
}
