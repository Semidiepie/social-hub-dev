import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import { PlayerProvider } from "@/context/PlayerContext";
import { PlayerBar } from "@/components/PlayerBar";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useNotificationBadge } from "@/hooks/useNotificationBadge";
import LoginPage from "@/pages/Login";
import RegisterPage from "@/pages/Register";
import HomePage from "@/pages/Home";
import BlogsPage from "@/pages/Blogs";
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
import VideoUploadPage from "@/pages/VideoUpload";
import DiscoverPage from "@/pages/Discover";
import MessagesPage from "@/pages/Messages";
import NotificationsPage from "@/pages/Notifications";
import ProfilePage from "@/pages/Profile";
import PostDetailPage from "@/pages/PostDetail";
import SettingsPage from "@/pages/Settings";
import AdminResetPinsPage from "@/pages/AdminResetPins";
import AdminVerifyPage from "@/pages/AdminVerify";
import AdminRememberingPage from "@/pages/AdminRemembering";
import AdminBlogsPage from "@/pages/AdminBlogs";

/**
 * Shell wrapper that mounts the sidebar/topbar/bottom-nav for authenticated
 * routes. Public routes (auth flows) render outside the shell.
 */
function Shell({ children }) {
  useNotificationBadge();
  const location = useLocation();
  const isAuthRoute = ["/login", "/register"].includes(location.pathname);
  // Only the reels player renders fullscreen (edge-to-edge, immersive). The
  // video watch page uses the normal shell so it matches the rest of the site.
  const isFullscreenRoute =
    /^\/reels\/(?!new$)[^/]+$/.test(location.pathname) ||
    location.pathname === "/live/new" ||
    /^\/live\/(?!new$)[^/]+$/.test(location.pathname);
  if (isAuthRoute || isFullscreenRoute) return children;
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PlayerProvider>
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "hsl(226 15% 12%)",
                border: "1px solid hsl(226 13% 20%)",
                color: "hsl(0 0% 98%)",
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
            <Route path="/blogs/new" element={<ProtectedRoute><BlogComposePage /></ProtectedRoute>} />
            <Route path="/blogs/request" element={<ProtectedRoute><BlogRequestPage /></ProtectedRoute>} />
            <Route path="/blogs/:id" element={<BlogReadPage />} />
            <Route path="/blogs/:id/edit" element={<ProtectedRoute><BlogComposePage /></ProtectedRoute>} />

            <Route path="/videos/new" element={<ProtectedRoute><VideoUploadPage /></ProtectedRoute>} />
            <Route path="/videos/:id" element={<VideoWatchPage />} />
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
              path="/admin/remembering"
              element={<ProtectedRoute><AdminRememberingPage /></ProtectedRoute>}
            />
            <Route
              path="/admin/blogs"
              element={<ProtectedRoute><AdminBlogsPage /></ProtectedRoute>}
            />

            <Route path="/music" element={<MusicPage />} />

            <Route path="/live" element={<ProtectedRoute><LiveFeedPage /></ProtectedRoute>} />
            <Route path="/live/new" element={<ProtectedRoute><GoLivePage /></ProtectedRoute>} />
            <Route path="/live/:id" element={<ProtectedRoute><LiveWatchPage /></ProtectedRoute>} />

            {/* Clean channel-handle URLs: /@username and /@username/{videoId}.
                Declared last so all static/specific routes win first. */}
            <Route path="/:handle/:videoId" element={<VideoWatchPage />} />
            <Route path="/:handle" element={<ProfilePage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
          <PlayerBar />
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
