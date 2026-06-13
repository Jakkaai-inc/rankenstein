import { Link, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { api, ApiError, setToken } from "@/api/client";
import { clearToken } from "@/api/storage";
import type { ProjectListItem } from "@/api/types";

export default function ProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { projects } = await api.listProjects();
      setProjects(projects);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return signOut();
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function signOut() {
    setToken(null);
    await clearToken();
    router.replace("/");
  }

  async function onCreate() {
    if (!name.trim() || !siteUrl.trim()) {
      setError("name and site URL required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { project } = await api.createProject({ name: name.trim(), siteUrl: siteUrl.trim() });
      setName("");
      setSiteUrl("");
      router.push(`/projects/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={projects}
      keyExtractor={(p) => p.id}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      ListHeaderComponent={
        <View style={styles.headerRow}>
          <Text style={styles.h1}>Projects</Text>
          <Pressable onPress={signOut}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item }) => (
        <Link href={`/projects/${item.id}`} asChild>
          <Pressable style={styles.projectCard}>
            <Text style={styles.projectName}>{item.name}</Text>
            <Text style={styles.projectMeta}>
              {item.siteUrl} · {item.shopifyConnected ? "Shopify ✓" : "not connected"} ·{" "}
              {item.brandConfirmed ? "brand ✓" : "brand pending"} · {item.pieces} pieces
            </Text>
          </Pressable>
        </Link>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No projects yet. Create your first below.</Text>}
      ListFooterComponent={
        <View style={styles.createCard}>
          <Text style={styles.h2}>New project</Text>
          <TextInput style={styles.input} placeholder="Project / client name" value={name} onChangeText={setName} />
          <TextInput
            style={styles.input}
            placeholder="yourstore.com"
            autoCapitalize="none"
            autoCorrect={false}
            value={siteUrl}
            onChangeText={setSiteUrl}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.button, creating && styles.buttonDisabled]} onPress={onCreate} disabled={creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create &amp; crawl</Text>}
          </Pressable>
          <Text style={styles.hint}>We crawl the site and draft brand guidelines. You confirm them before anything generates.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  h1: { fontSize: 24, fontWeight: "800" },
  h2: { fontSize: 16, fontWeight: "700" },
  signOut: { color: "#888" },
  projectCard: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14 },
  projectName: { fontSize: 16, fontWeight: "600", color: "#1d4ed8" },
  projectMeta: { color: "#666", marginTop: 4, fontSize: 13 },
  empty: { color: "#999", padding: 8 },
  createCard: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14, gap: 10, marginTop: 14 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, fontSize: 15 },
  button: { backgroundColor: "#000", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700" },
  hint: { fontSize: 12, color: "#aaa" },
  error: { color: "#c0392b" },
});
