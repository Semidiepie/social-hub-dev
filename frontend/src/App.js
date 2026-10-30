import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { CheckCircle2, XCircle, Info, AlertTriangle, Loader2 } from "lucide-react";
import { AuthProvider } from "@/context/AuthContext";
import { PlayerProvider } from "@/context/PlayerContext";
import { CallProvider } from "@/context/CallContext";
import { PlayerBar } from "@/components/PlayerBar";
import { AppShell } from "@/components/AppShell";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import SplashScreen from "@/components/SplashScreen";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useNotificationBadge } from "@/hooks/useNotificationBadge";
import { captureRef } from "@/lib/share";
import LoginPage from "@/pages/Login";
import RegisterPage from "@/pages/Register";
import HomePage from "@/pages/Home";
import BlogsPage from "@/pages/Blogs";
import EmailPage from "@/pages/Email";
import BlogReadPage from "@/pages/BlogRead";
import BlogComposePage from "@/pages/BlogCompose";
import BlogRequestPage from "@/pages/BlogRequest";
import VideoWatchPage from "@/pages/VideoWatch";
import ReelWatchPage from "@/pages/ReelWatch";
import ReelsFeedPage from "@/pages/ReelsFeed";
import ReelUploadPage from "@/pages/ReelUpload";
import MusicPage from "@/pages/Music";
import LiveFeedPage from "@/pages/LiveFeed";
import GoLivePage from "@/pages/GoLive";
import LiveWatchPage from "@/pages/LiveWatch";
import PetPage from "@/pages/Pet";
import VideoUploadPage from "@/pages/VideoUpload";
import VideosPage from "@/pages/Videos";
import MarketPage from "@/pages/Market";
import WalletPage from "@/pages/Wallet";
import ThemeLayer from "@/components/ThemeLayer";
import DiscoverPage from "@/pages/Discover";
import MessagesPage from "@/pages/Messages";
import LiveChatPage from "@/pages/LiveChatPage";
import NotificationsPage from "@/pages/Notifications";
import ProfilePage from "@/pages/Profile";
import PostDetailPage from "@/pages/PostDetail";
import SettingsPage from "@/pages/Settings";
import AdminResetPinsPage from "@/pages/AdminResetPins";
import AdminVerifyPage from "@/pages/AdminVerify";
import AdminCuratePage from "@/pages/AdminCurate";
import AdminAccountsPage from "@/pages/AdminAccounts";
import AdminRememberingPage from "@/pages/AdminRemembering";
import AdminBlogsPage from "@/pages/AdminBlogs";
import AdminAnnouncePage from "@/pages/AdminAnnounce";
import AdminKeysPage from "@/pages/AdminKeys";
import AdminGamesPage from "@/pages/AdminGames";
import AdminAiCharactersPage from "@/pages/AdminAiCharacters";
import GamesHubPage from "@/pages/GamesHub";
import GameProfilePage from "@/pages/GameProfile";
import GamePlayerPage from "@/pages/GamePlayer";

/**
 * Listen for "navigate here" messages from the push service worker. When a
 * system push notification is tapped and the app is already open, the SW can't
 * route on its own (WindowClient.navigate() is unsupported on iOS), so it
 * postMessages the target path and we route client-side via react-router.
 */
function usePushNavigation() {
  const navigate = useNavigate();
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onMessage = (e) => {
      if (e.data && e.data.type === "pmp-navigate" && typeof e.data.url === "string") {
        navigate(e.data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);
}

/**
 * Shell wrapper that mounts the sidebar/topbar/bottom-nav for authenticated
 * routes. Public routes (auth flows) render outside the shell.
 */
function Shell({ children }) {
  useNotificationBadge();
  usePushNavigation();
  const location = useLocation();
  const isAuthRoute = ["/login", "/register"].includes(location.pathname);
  // Only the reels player renders fullscreen (edge-to-edge, immersive). The
  // video watch page uses the normal shell so it matches the rest of the site.
  const isFullscreenRoute =
    location.pathname === "/reels" ||
    /^\/reels\/(?!new$)[^/]+$/.test(location.pathname) ||
    location.pathname === "/live/new" ||
    /^\/live\/(?!new$)[^/]+$/.test(location.pathname);
  if (isAuthRoute || isFullscreenRoute) return children;
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  React.useEffect(() => { captureRef(); }, []);
  return (
    <BrowserRouter>
      <SplashScreen />
      <AuthProvider>
        <PlayerProvider>
          <CallProvider>
          <Toaster
            theme="dark"
            position="top-right"
            gap={10}
            offset={16}
            icons={{
              success: <CheckCircle2 size={18} strokeWidth={2.5} className="text-green-500" />,
              error: <XCircle size={18} strokeWidth={2.5} className="text-red-500" />,
              info: <Info size={18} strokeWidth={2.5} className="text-primary" />,
              warning: <AlertTriangle size={18} strokeWidth={2.5} className="text-amber-400" />,
              loading: <Loader2 size={18} className="animate-spin text-primary" />,
            }}
            toastOptions={{
              unstyled: false,
              classNames: {
                toast: "pmp-toast",
                title: "pmp-toast-title",
                description: "pmp-toast-desc",
                icon: "pmp-toast-icon",
              },
            }}
          />
          <Shell>
            <Routes>
            {/* Public / auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Home & content — viewable by everyone but interactions need auth */}
            <Route path="/" element={<HomePage />} />
            <Route path="/blogs" element={<BlogsPage />} />
            <Route path="/email" element={<ProtectedRoute><EmailPage /></ProtectedRoute>} />            <Route path="/blogs/new" element={<ProtectedRoute><BlogComposePage /></ProtectedRoute>} />
            <Route path="/blogs/request" element={<ProtectedRoute><BlogRequestPage /></ProtectedRoute>} />
            <Route path="/blogs/:id" element={<BlogReadPage />} />
            <Route path="/blogs/:id/edit" element={<ProtectedRoute><BlogComposePage /></ProtectedRoute>} />

            <Route path="/videos/new" element={<ProtectedRoute><VideoUploadPage /></ProtectedRoute>} />
            <Route path="/videos" element={<VideosPage />} />
            <Route path="/videos/:id" element={<VideoWatchPage />} />
            <Route path="/market" element={<ProtectedRoute><MarketPage /></ProtectedRoute>} />
            <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
            <Route path="/reels" element={<ReelsFeedPage />} />
            <Route path="/reels/new" element={<ProtectedRoute><ReelUploadPage /></ProtectedRoute>} />
            <Route path="/reels/:id" element={<ReelWatchPage />} />

            <Route path="/discover" element={<DiscoverPage />} />

            <Route
              path="/messages"
              element={<ProtectedRoute><MessagesPage /></ProtectedRoute>}
            />
            <Route
              path="/messages/:convId"
              element={<ProtectedRoute><MessagesPage /></ProtectedRoute>}
            />
            <Route path="/livechat" element={<LiveChatPage />} />

            <Route
              path="/notifications"
              element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>}
            />
            <Route
              path="/profile"
              element={<ProtectedRoute><ProfilePage /></ProtectedRoute>}
            />
            <Route path="/user/:userId" element={<ProfilePage />} />
            <Route path="/posts/:id" element={<PostDetailPage />} />
            <Route
              path="/settings"
              element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}
            />
            <Route
              path="/admin/reset-pins"
              element={<ProtectedRoute><AdminResetPinsPage /></ProtectedRoute>}
            />
            <Route
              path="/admin/verify"
              element={<ProtectedRoute><AdminVerifyPage /></ProtectedRoute>}
            />
            <Route
              path="/admin/curate"
              element={<ProtectedRoute><AdminCuratePage /></ProtectedRoute>}
            />
            <Route
              path="/admin/accounts"
              element={<ProtectedRoute><AdminAccountsPage /></ProtectedRoute>}
            />
            <Route
              path="/admin/remembering"
              element={<ProtectedRoute><AdminRememberingPage /></ProtectedRoute>}
            />
            <Route
              path="/admin/blogs"
              element={<ProtectedRoute><AdminBlogsPage /></ProtectedRoute>}
            />
            <Route
              path="/admin/announce"
              element={<ProtectedRoute><AdminAnnouncePage /></ProtectedRoute>}
            />
            <Route
              path="/admin/keys"
              element={<ProtectedRoute><AdminKeysPage /></ProtectedRoute>}
            />

            <Route path="/music" element={<MusicPage />} />

            <Route path="/live" element={<ProtectedRoute><LiveFeedPage /></ProtectedRoute>} />
            <Route path="/live/new" element={<ProtectedRoute><GoLivePage /></ProtectedRoute>} />
            <Route path="/live/:id" element={<ProtectedRoute><LiveWatchPage /></ProtectedRoute>} />

            <Route path="/pet" element={<ProtectedRoute><PetPage /></ProtectedRoute>} />

            <Route path="/games" element={<ProtectedRoute><GamesHubPage /></ProtectedRoute>} />
            <Route path="/games/:id" element={<ProtectedRoute><GameProfilePage /></ProtectedRoute>} />
            <Route path="/games/:id/play" element={<ProtectedRoute><GamePlayerPage /></ProtectedRoute>} />
            <Route path="/admin/games" element={<ProtectedRoute><AdminGamesPage /></ProtectedRoute>} />
            <Route path="/admin/ai-characters" element={<ProtectedRoute><AdminAiCharactersPage /></ProtectedRoute>} />

            {/* Clean channel-handle URLs: /@username and /@username/{videoId}.
                Declared last so all static/specific routes win first. */}
            <Route path="/:handle/:videoId" element={<VideoWatchPage />} />
            <Route path="/:handle" element={<ProfilePage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
          <PlayerBar />
          <InstallAppPrompt />
          <ThemeLayer />
          </CallProvider>
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
