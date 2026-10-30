import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Inbox, Send, PenSquare, Loader2, Trash2, ArrowLeft, AlertTriangle, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";

const MAIL_DOMAIN = "@postmeplex.com";

export default function EmailPage() {
  const { user } = useAuth();
  const eligible = (user?.email || "").toLowerCase().endsWith(MAIL_DOMAIN);
  const [box, setBox] = useState("inbox");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [compose, setCompose] = useState(false);

  const load = useCallback(async () => {
    if (!eligible) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await api.get(`/mail/${box}`);
      setItems(rows);
    } catch (e) {
      toast.error(e.message || "Failed to load mail");
    } finally {
      setLoading(false);
    }
  }, [box, eligible]);

  useEffect(() => {
    load();
  }, [load]);

  const openMail = async (m) => {
    try {
      const full = await api.get(`/mail/${m.id}`);
      setOpen(full);
      if (box === "inbox" && !m.read) {
        setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
      }
    } catch (e) {
      toast.error(e.message || "Couldn't open");
    }
  };

  const del = async (id) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    if (open?.id === id) setOpen(null);
    try {
      await api.del(`/mail/${id}`);
    } catch (e) {
      toast.error(e.message || "Failed");
      load();
    }
  };

  return (
    <div className="mx-auto max-w-3xl" data-testid="email-page">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="text-primary" size={26} />
          <h1 className="text-3xl font-black tracking-tight">Email</h1>
        </div>
        <Button
          onClick={() => setCompose(true)}
          disabled={!eligible}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          data-testid="email-compose-btn"
        >
          <PenSquare size={16} /> Compose
        </Button>
      </header>

      {/* Persistent warning label — Mail only works with @postmeplex.com */}
      <div
        className={`mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
          eligible ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" : "border-destructive/30 bg-destructive/10 text-destructive"
        }`}
        data-testid="email-domain-warning"
      >
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div>
          Email only works with addresses ending in <b>{MAIL_DOMAIN}</b> — you can only send to and receive from other {MAIL_DOMAIN} accounts.
          {!eligible && (
            <>
              {" "}Your account email{user?.email ? ` (${user.email})` : ""} isn't eligible.{" "}
              <Link to="/settings" className="font-bold underline" data-testid="email-change-email-link">
                Change your email in Settings
              </Link>{" "}to use it.
            </>
          )}
        </div>
      </div>

      {/* Box tabs */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => { setBox("inbox"); setOpen(null); }}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold ${box === "inbox" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
          data-testid="email-tab-inbox"
        >
          <Inbox size={15} /> Inbox
        </button>
        <button
          onClick={() => { setBox("sent"); setOpen(null); }}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold ${box === "sent" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
          data-testid="email-tab-sent"
        >
          <Send size={15} /> Sent
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : !eligible ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground" data-testid="email-locked-state">
          Set a {MAIL_DOMAIN} email in Settings to start using PostMePlex Email.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground" data-testid="email-empty-state">
          {box === "inbox" ? "Your inbox is empty." : "You haven't sent any email yet."}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card" data-testid="email-list">
          {items.map((m) => (
            <li key={m.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-secondary/40">
              <button onClick={() => openMail(m)} className="flex min-w-0 flex-1 items-center gap-3 text-left" data-testid={`email-row-${m.id}`}>
                {box === "inbox" && !m.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" data-testid="email-unread-dot" />}
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm ${box === "inbox" && !m.read ? "font-black" : "font-semibold"}`}>
                    {box === "inbox" ? (m.from_name || m.from_email) : `To: ${m.to_email}`}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    <span className="text-foreground/80">{m.subject || "(no subject)"}</span>
                    {m.body ? <span> — {m.body}</span> : null}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(m.created_at)}</span>
              </button>
              <button onClick={() => del(m.id)} className="shrink-0 rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100" data-testid={`email-delete-${m.id}`}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <ReadModal mail={open} box={box} onClose={() => setOpen(null)} onDelete={() => del(open.id)} onReply={(to) => { setOpen(null); setCompose({ to }); }} />}
      {compose && <ComposeModal prefill={typeof compose === "object" ? compose : null} onClose={() => setCompose(false)} onSent={() => { setCompose(false); if (box === "sent") load(); toast.success("Email sent"); }} />}
    </div>
  );
}

function ReadModal({ mail, box, onClose, onDelete, onReply }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} data-testid="email-read-modal">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-xl font-black">{mail.subject || "(no subject)"}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-secondary" data-testid="email-read-close"><X size={18} /></button>
        </div>
        <div className="mb-4 text-sm text-muted-foreground">
          <div><b className="text-foreground">From:</b> {mail.from_name ? `${mail.from_name} · ` : ""}{mail.from_email}</div>
          <div><b className="text-foreground">To:</b> {mail.to_email}</div>
          <div>{timeAgo(mail.created_at)}</div>
        </div>
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed" data-testid="email-read-body">{mail.body || "(no message)"}</div>
        <div className="mt-6 flex gap-2">
          {box === "inbox" && (
            <Button onClick={() => onReply(mail.from_email)} className="gap-2 bg-primary text-primary-foreground" data-testid="email-reply-btn">
              <Send size={15} /> Reply
            </Button>
          )}
          <Button variant="outline" onClick={onDelete} className="gap-2" data-testid="email-read-delete"><Trash2 size={15} /> Delete</Button>
        </div>
      </div>
    </div>
  );
}

function ComposeModal({ prefill, onClose, onSent }) {
  const [to, setTo] = useState(prefill?.to || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!to.trim()) return toast.error("Enter a recipient.");
    if (!to.trim().toLowerCase().endsWith(MAIL_DOMAIN)) return toast.error(`Recipient must end in ${MAIL_DOMAIN}`);
    if (!subject.trim() && !body.trim()) return toast.error("Write a subject or message.");
    setSending(true);
    try {
      await api.post("/mail/send", { to_email: to.trim(), subject: subject.trim(), body });
      onSent();
    } catch (e) {
      toast.error(e.message || "Couldn't send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} data-testid="email-compose-modal">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black">New email</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-secondary" data-testid="email-compose-close"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder={`recipient${MAIL_DOMAIN}`} data-testid="email-compose-to" className="h-11" />
            <p className="mt-1 text-[11px] text-muted-foreground">Only {MAIL_DOMAIN} recipients are allowed.</p>
          </div>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={200} data-testid="email-compose-subject" className="h-11" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" rows={8} data-testid="email-compose-body" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={sending} className="gap-2 bg-primary text-primary-foreground" data-testid="email-compose-send">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={15} />} Send
          </Button>
        </div>
      </div>
    </div>
  );
}
