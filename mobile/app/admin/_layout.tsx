import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";

/**
 * PostMePlex Studio gate, matching the web app (frontend/src/components/AdminLayout.jsx):
 * the Studio is visible only when user.is_super_admin OR user.is_admin is true;
 * everyone else is sent back to Home.
 */
export default function AdminLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = !!(user?.is_admin || user?.is_super_admin);
  useEffect(() => {
    if (user && !isAdmin) router.replace("/(tabs)/home" as never);
  }, [user, isAdmin, router]);
  if (!user || !isAdmin) return null;
  return <Stack screenOptions={{ headerShown: false }} />;
}
