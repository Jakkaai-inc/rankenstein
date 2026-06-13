import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "@/api/client";
import type { ProjectDetail } from "@/api/types";

function GateStep({ n, title, done, current }: { n: number; title: string; done: boolean; current: boolean }) {
  return (
    <View style={styles.step}>
      <View style={[styles.badge, done ? styles.badgeDone : current ? styles.badgeCurrent : styles.badgeIdle]}>
        <Text style={styles.badgeText}>{done ? "✓" : n}</Text>
      </View>
      <Text style={[styles.stepTitle, !done && !current && styles.stepIdle]}>{title}</Text>
    </View>
  );
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const { project } = await api.getProject(id);
      setProject(project);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error || !project) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "not found"}</Text>
      </View>
    );
  }

  const { gate } = project;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      <View>
        <Text style={styles.h1}>{project.name}</Text>
        <Text style={styles.meta}>
          {project.siteUrl} · {project.counts.pages} pages · {project.counts.pieces} pieces
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>Setup</Text>
        <GateStep n={1} title="Connect Shopify" done={gate.shopifyConnected} current={!gate.shopifyConnected} />
        <GateStep
          n={2}
          title="Confirm brand guidelines"
          done={gate.brandConfirmed}
          current={gate.shopifyConnected && !gate.brandConfirmed}
        />
        <GateStep n={3} title="Configure & run" done={false} current={gate.brandConfirmed} />
        {!gate.brandConfirmed ? (
          <Text style={styles.note}>Generation is locked until the brand profile is confirmed (the ask-first rule).</Text>
        ) : null}
      </View>

      {project.brand ? (
        <View style={styles.section}>
          <Text style={styles.h2}>Brand</Text>
          <Text style={styles.kv}>
            <Text style={styles.k}>Name: </Text>
            {project.brand.brandName}
          </Text>
          {project.brand.industry ? (
            <Text style={styles.kv}>
              <Text style={styles.k}>Industry: </Text>
              {project.brand.industry}
            </Text>
          ) : null}
          {project.brand.seedTopics.length ? (
            <Text style={styles.kv}>
              <Text style={styles.k}>Seed topics: </Text>
              {project.brand.seedTopics.join(", ")}
            </Text>
          ) : null}
          <Text style={styles.kv}>
            <Text style={styles.k}>Status: </Text>
            {project.brand.confirmed ? "confirmed" : "pending"}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.h2}>Activity</Text>
        {project.runs.length === 0 ? (
          <Text style={styles.note}>No runs yet.</Text>
        ) : (
          project.runs.map((r) => (
            <Text key={r.id} style={styles.run}>
              {r.status.toLowerCase()} · {r.done}/{r.total} done · {r.flagged} flagged ·{" "}
              {r.createdAt.slice(0, 16).replace("T", " ")}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 22, fontWeight: "800" },
  h2: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  meta: { color: "#666", marginTop: 4, fontSize: 13 },
  section: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14 },
  step: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badgeDone: { backgroundColor: "#15803d" },
  badgeCurrent: { backgroundColor: "#000" },
  badgeIdle: { backgroundColor: "#cbd5e1" },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  stepTitle: { fontSize: 15, fontWeight: "500" },
  stepIdle: { color: "#94a3b8" },
  note: { color: "#a16207", fontSize: 13, marginTop: 6 },
  kv: { fontSize: 14, marginTop: 4, color: "#222" },
  k: { fontWeight: "600" },
  run: { color: "#555", fontSize: 13, marginTop: 4 },
  error: { color: "#c0392b" },
});
