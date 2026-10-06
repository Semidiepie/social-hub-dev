import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/api";

const BASE_URL = process.env.REACT_APP_BACKEND_URL;

function wsUrl(streamId) {
  const token = getToken();
  const base = BASE_URL.replace(/^http/, "ws");
  return `${base}/api/live/${streamId}/ws?token=${encodeURIComponent(token || "")}`;
}

let heartSeq = 0;

/**
 * Connects to a live stream's real-time channel. Returns chat log, live viewer
 * count, heart total, transient floating-heart events, gift catalog, the
 * "ended" flag and senders for chat/heart/gift.
 */
export function useLiveSocket(streamId) {
  const [connected, setConnected] = useState(false);
  const [chat, setChat] = useState([]);
  const [viewers, setViewers] = useState(0);
  const [hearts, setHearts] = useState(0);
  const [floaters, setFloaters] = useState([]); // {id} transient
  const [gifts, setGifts] = useState([]);
  const [ended, setEnded] = useState(false);
  const [balance, setBalance] = useState(null);
  const [walletError, setWalletError] = useState(null);
  const wsRef = useRef(null);
  const pingRef = useRef(null);

  const pushFloater = useCallback(() => {
    const id = ++heartSeq;
    setFloaters((f) => [...f, { id }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 2600);
  }, []);

  useEffect(() => {
    if (!streamId) return;
    let closed = false;
    const ws = new WebSocket(wsUrl(streamId));
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      pingRef.current = setInterval(() => {
        try { ws.send(JSON.stringify({ type: "ping" })); } catch { /* noop */ }
      }, 25000);
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
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
          setChat((c) => [...c.slice(-199), m.message]);
          break;
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
        case "wallet":
          setBalance(m.balance);
          break;
        case "error":
          if (m.detail === "insufficient_tokens") setWalletError({ ts: Date.now() });
          break;
        default:
          break;
      }
    };
    ws.onclose = () => { if (!closed) setConnected(false); };
    ws.onerror = () => setConnected(false);

    return () => {
      closed = true;
      clearInterval(pingRef.current);
      try { ws.close(); } catch { /* noop */ }
    };
  }, [streamId, pushFloater]);

  const send = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const sendChat = useCallback((text) => text.trim() && send({ type: "chat", text: text.trim() }), [send]);
  const sendHeart = useCallback(() => send({ type: "heart" }), [send]);
  const sendGift = useCallback((giftId) => send({ type: "gift", gift_id: giftId }), [send]);

  return { connected, chat, viewers, hearts, floaters, gifts, ended, balance, walletError, sendChat, sendHeart, sendGift };
}
