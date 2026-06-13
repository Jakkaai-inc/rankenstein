import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { api, ApiError } from "@/api/client";
import type { BrandPublic } from "@/api/types";

// Brand guidelines = the ask-first gate. Draft pulls a proposal from the site
// crawl (refuse-and-flag: an unreadable site comes back as a name-only stub,
// never an invented brand). The user reviews/edits every field, then an
// explicit "Confirm" tap is what unlocks generation. Nothing auto-confirms.
export default function BrandScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [audience, setAudience] = useState("");
  const [voice, setVoice] = useState("");
  const [brandFacts, setBrandFacts] = useState("");
  const [seedTopics, setSeedTopics] = useState("");
  const [competitors, setCompetitors] = useState("");

  // Hydrate the form from whatever brand the project already has (if any).
  const apply = useCallback((b: BrandPublic) => {
    setBrandName(b.brandName ?? "");
    setIndustry(b.industry ?? "");
    setAudience(b.audience ?? "");
    setVoice(b.voice ?? "");
    setBrandFacts(b.brandFacts ?? "");
    setSeedTopics(b.seedTopics.join(", "));
    setCompetitors(b.competitors.join(", "));
    setConfirmed(b.confirmed);
  }, []);

  useEffect(() => {
    if (!id) return;
    api
      .getProject(id)
      .then(({ project }) => {
        if (project.brand) apply(project.brand);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load"))
      .finally(() => setLoading(false));
  }, [id, apply]);

  async function onDraft() {
    if (!id) return;
    setDrafting(true);
    setError(null);
    try {
      const { brand } = await api.draftBrand(id);
      apply(brand);
      if (!brand.seedTopics.length) {
        Alert.alert(
          "Drafted from site",
          "We could not read enough from the site to suggest seed topics. Add at least one before confirming.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "draft failed");
    } finally {
      setDrafting(false);
    }
  }

  const toList = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  async function onConfirm() {
    if (!id) return;
    const topics = toList(seedTopics);
    if (!topics.length) {
      setError("Add at least one seed topic. Research starts from these.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await api.confirmBrand(id, {
        brandName: brandName.trim() || undefined,
        industry: industry.trim() || undefined,
        audience: audience.trim() || undefined,
        voice: voice.trim() || undefined,
        brandFacts: brandFacts.trim() || undefined,
        seedTopics: topics,
        competitors: toList(competitors),
      });
      // Back to detail; its useFocusEffect reloads and the gate flips to ✓.
      router.back();
    } catch (e) {
      // The server enforces seedTopics too; surface its message verbatim.
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "confirm failed";
      setError(msg);
    } finally {
      setConfirming(false);
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Brand" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>Brand guidelines</Text>
        <Text style={styles.sub}>
          {confirmed
            ? "Confirmed. Editing and confirming again updates the guidelines."
            : "Review the draft, edit anything, then confirm. Confirming unlocks generation."}
        </Text>

        <Pressable style={[styles.secondary, drafting && styles.disabled]} onPress={onDraft} disabled={drafting}>
          {drafting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.secondaryText}>Draft from site</Text>
          )}
        </Pressable>

        <Field label="Brand name" value={brandName} onChange={setBrandName} placeholder="Acme Co" />
        <Field label="Industry" value={industry} onChange={setIndustry} placeholder="e.g. outdoor gear" />
        <Field label="Audience" value={audience} onChange={setAudience} placeholder="who you sell to" multiline />
        <Field label="Voice" value={voice} onChange={setVoice} placeholder="tone and style" multiline />
        <Field
          label="Brand facts"
          value={brandFacts}
          onChange={setBrandFacts}
          placeholder="grounded facts the writer may rely on"
          multiline
        />
        <Field
          label="Seed topics (required, comma-separated)"
          value={seedTopics}
          onChange={setSeedTopics}
          placeholder="trail running, waterproofing, gift guides"
          multiline
        />
        <Field
          label="Competitors (comma-separated)"
          value={competitors}
          onChange={setCompetitors}
          placeholder="competitor.com, other.com"
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.cta, confirming && styles.disabled]} onPress={onConfirm} disabled={confirming}>
          {confirming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>{confirmed ? "Update brand" : "Confirm brand"}</Text>
          )}
        </Pressable>
        <Text style={styles.hint}>
          We never invent brand facts. Anything you leave blank stays blank.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        autoCapitalize="none"
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 22, fontWeight: "800" },
  sub: { color: "#666", fontSize: 13 },
  fieldGroup: { gap: 4 },
  label: { fontSize: 13, fontWeight: "600", color: "#333" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, fontSize: 15 },
  inputMultiline: { minHeight: 60, textAlignVertical: "top" },
  secondary: { borderWidth: 1, borderColor: "#000", borderRadius: 8, padding: 12, alignItems: "center" },
  secondaryText: { fontWeight: "700", color: "#000" },
  cta: { backgroundColor: "#000", borderRadius: 8, padding: 16, alignItems: "center", marginTop: 4 },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.6 },
  error: { color: "#c0392b" },
  hint: { fontSize: 12, color: "#aaa", marginBottom: 24 },
});
