import { Redirect } from "expo-router";

/** Videos on the web (/videos) is the video feed, which on mobile is the Watch tab. */
export default function VideosScreen() {
  return <Redirect href="/(tabs)/watch" />;
}
