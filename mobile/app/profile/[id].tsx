import React from "react";
import { useLocalSearchParams } from "expo-router";
import ProfileView from "@/src/screens/ProfileView";

export default function ProfileById() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProfileView userId={id ?? null} />;
}
