import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { setToken } from "@/api/client";
import { getToken } from "@/api/storage";

// Hydrate the bearer token from SecureStore before any screen renders, so an
// already-signed-in user lands straight on their projects.
export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getToken()
      .then((t) => {
        if (t) setToken(t);
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: "#fff" }, headerTitleStyle: { fontWeight: "700" } }}>
      <Stack.Screen name="index" options={{ title: "Rankenstein", headerShown: false }} />
      <Stack.Screen name="projects/index" options={{ title: "Projects" }} />
      <Stack.Screen name="projects/[id]/index" options={{ title: "Project" }} />
      <Stack.Screen name="projects/[id]/brand" options={{ title: "Brand" }} />
    </Stack>
  );
}
