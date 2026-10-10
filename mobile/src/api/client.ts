// API client — JWT-aware fetch wrapper.
import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

const TOKEN_KEY = "postmeplex.token";

export async function getToken(): Promise<string | null> {
  return storage.secureGet<string>(TOKEN_KEY, "");
}

export async function setToken(token: string): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  authed = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (authed) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, { ...init, headers });
  } catch {
    // fetch() throws for DNS failures, offline, TLS handshake failures, etc.
    // Give a friendlier message so users know it's connectivity, not credentials.
    throw new Error(
      "Can't reach PostMePlex servers. Please check your internet connection and try again.",
    );
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data?.detail || data?.message || `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, authed = true) => request<T>(path, { method: "GET" }, authed),
  post: <T>(path: string, body?: unknown, authed = true) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, authed),
  put: <T>(path: string, body?: unknown, authed = true) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }, authed),
  del: <T>(path: string, authed = true) => request<T>(path, { method: "DELETE" }, authed),
};

// --- Types ---
export interface UserPublic {
  id: string;
  username: string;
  display_name: string;
  email: string;
  bio: string;
  avatar_url: string;
  is_verified: boolean;
  is_streamer: boolean;
  is_super_admin?: boolean;
  is_admin?: boolean;
  remembering?: boolean;
  remembering_status?: string | null;
  followers: number;
  following: number;
  posts_count: number;
  reset_pin_enabled?: boolean;
  blog_permission?: "granted" | "pending" | null;
  tokens?: number;
  owned_frames?: string[];
  equipped_frame?: string | null;
  frame_enabled?: boolean;
}

export interface WalletTx {
  id: string;
  amount: number;
  kind: string;
  note: string;
  created_at: string;
}

export interface WalletInfo {
  balance: number;
  transactions: WalletTx[];
  daily_reward: number;
  can_claim_daily: boolean;
  next_claim_at: string | null;
}

export interface StoreItem {
  id: string;
  name: string;
  blurb: string;
  price: number;
  kind: string;
  owned: boolean;
}

export interface AudioRoomHost {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  is_verified: boolean;
}

export interface AudioRoom {
  id: string;
  channel_name: string;
  app_id: string;
  title: string;
  topic: string | null;
  host: AudioRoomHost;
  guests: AudioRoomHost[];
  audience_count: number;
  started_at: string;
}

export interface AudienceUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface BlogAuthor {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  is_verified: boolean;
}

export interface Blog {
  id: string;
  title: string;
  subtitle: string;
  cover_url: string;
  body_md: string;
  status: "draft" | "published";
  tags: string[];
  views: number;
  likes: number;
  liked_by_me: boolean;
  reading_time: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  author: BlogAuthor | null;
}

export interface BlogPermission {
  granted: boolean;
  pending: boolean;
  requested_reason: string;
}

export interface BlogRequest {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  is_verified: boolean;
  reason: string;
  requested_at: string | null;
}

export interface Author {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  is_verified: boolean;
  is_streamer: boolean;
}

export interface FeedItem {
  id: string;
  type: "post" | "reel" | "video";
  caption: string;
  title?: string;
  description?: string;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  game_tag: string | null;
  duration: number | null;
  likes: number;
  comments_count: number;
  views: number;
  created_at: string;
  liked_by_me: boolean;
  featured?: boolean;
  author: Author | null;
}

export type VideoVisibility = "public" | "unlisted" | "private";

export interface VideoItem {
  id: string;
  title: string;
  description: string;
  video_url: string;
  thumbnail_url: string | null;
  duration: number | null;
  size_bytes: number | null;
  visibility: VideoVisibility;
  tags: string[];
  category: string | null;
  views: number;
  likes: number;
  comments_count: number;
  created_at: string;
  liked_by_me: boolean;
  author: Author | null;
}

export interface VideoComment {
  id: string;
  text: string;
  parent_id?: string | null;
  created_at: string;
  author: Author | null;
}

export interface StoryUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  is_verified: boolean;
  preview_url: string;
  count: number;
  seen: boolean;
  is_me: boolean;
}

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  thumbnail_url: string | null;
  caption: string;
  duration: number | null;
  created_at: string;
  expires_at: string;
}

export interface UserStoriesResponse {
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string;
    is_verified: boolean;
  } | null;
  stories: Story[];
}

export interface Comment {
  id: string;
  post_id: string;
  parent_id?: string | null;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  is_verified?: boolean;
  verified_color?: string | null;
  text: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: "like" | "comment" | "follow" | "live" | "pet" | "update";
  actor_id: string;
  actor_name: string;
  actor_avatar: string;
  text: string;
  post_id?: string;
  link?: string;
  live_stream_id?: string;
  read: boolean;
  created_at: string;
}

export interface ConversationMember {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface ConversationPreview {
  id: string;
  is_group: boolean;
  title: string;
  avatar_url: string;
  member_ids: string[];
  members: ConversationMember[];
  last_message: { text: string; sender_id: string; sender_username: string; created_at: string } | null;
  unread: number;
  updated_at: string;
}

export interface MessageReaction {
  user_id: string;
  username: string;
  emoji: string;
  at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_username: string;
  sender_avatar: string;
  text: string;
  image_url: string | null;
  reactions: MessageReaction[];
  read_by: string[];
  created_at: string;
}

export interface TypingResponse {
  users: { id: string; username: string; display_name: string }[];
}

export interface ActiveFriend {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  is_verified: boolean;
  verified_color?: string | null;
  online: boolean;
  last_active_at: string;
}

export interface ActivePresence {
  appear_offline: boolean;
  friends: ActiveFriend[];
}
