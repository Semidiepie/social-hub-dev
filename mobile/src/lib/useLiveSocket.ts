// Live stream real-time channel (mobile). Mirrors the web useLiveSocket:
// chat, viewer count, hearts, transient floating hearts, gifts, ended flag.
import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "@/src/api/client";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

export interface LiveGift {
  id: string;
  name: string;
  glyph: string;
  coins: number;
  color: string;
}

export interface LiveChatMessage {
  id: string;
  kind?: "chat" | "gift" | "system";
  user_id?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
  remembering?: boolean;
  text: string;
  gift?: LiveGift;
  created_at?: string;
}

let heartSeq = 0;

export function useLiveSocket(streamId?: string) {
  const [connected, setConnected] = useState(false);
  const [chat, setChat] = useState<LiveChatMessage[]>([]);
  const [viewers, setViewers] = useState(0);
  const [hearts, setHearts] = useState(0);
  const [floaters, setFloaters] = useState<{ id: number }[]>([]);
  const [gifts, setGifts] = useState<LiveGift[]>([]);
  const [ended, setEnded] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushFloater = useCallback(() => {
    const id = ++heartSeq;
    setFloaters((f) => [...f, { id }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 2600);
  }, []);

  useEffect(() => {
    if (!streamId) return;
    let closed = false;
    let ws: WebSocket | null = null;

    (async () => {
      const token = await getToken();
      const base = BASE_URL.replace(/^http/, "ws");
      ws = new WebSocket(`${base}/api/live/${streamId}/ws?token=${encodeURIComponent(token || "")}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        pingRef.current = setInterval(() => {
          try { ws?.send(JSON.stringify({ type: "ping" })); } catch { /* noop */ }
        }, 25000);
      };
      ws.onmessage = (e: WebSocketMessageEvent) => {
        const m = JSON.parse(e.data as string);
        switch (m.type) {
          case "init":
            setChat(m.chat || []);
            setHearts(m.hearts || 0);
            setGifts(m.gifts || []);
            break;
          case "viewers":
            setViewers(m.count || 0);
            break;
          case "chat":
          case "gift":
            setChat((c) => [...c.slice(-199), m.message]);
            break;
          case "heart":
            setHearts((h) => h + 1);
            pushFloater();
            break;
          case "system":
            setChat((c) => [...c.slice(-199), { id: `sys-${Date.now()}-${Math.random()}`, kind: "system", text: m.text }]);
            break;
          case "ended":
            setEnded(true);
            break;
          default:
            break;
        }
      };
      ws.onclose = () => { if (!closed) setConnected(false); };
      ws.onerror = () => setConnected(false);
    })();

    return () => {
      closed = true;
      if (pingRef.current) clearInterval(pingRef.current);
      try { ws?.close(); } catch { /* noop */ }
    };
  }, [streamId, pushFloater]);

  const send = useCallback((payload: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const sendChat = useCallback((text: string) => { if (text.trim()) send({ type: "chat", text: text.trim() }); }, [send]);
  const sendHeart = useCallback(() => send({ type: "heart" }), [send]);
  const sendGift = useCallback((giftId: string) => send({ type: "gift", gift_id: giftId }), [send]);

  return { connected, chat, viewers, hearts, floaters, gifts, ended, sendChat, sendHeart, sendGift };
}
