import React from "react";
import { useLocalSearchParams } from "expo-router";
import ProfileView from "@/src/screens/ProfileView";
import { useAuth } from "@/src/context/AuthContext";

export default function ProfileTab() {
  const { user } = useAuth();
  return <ProfileView userId={user?.id ?? null} isOwn />;
}
