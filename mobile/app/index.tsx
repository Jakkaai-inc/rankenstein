import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { api, setToken } from "@/api/client";
import { getToken, saveToken } from "@/api/storage";

// Phase 0 login-lite: email (+ optional name) -> bearer token in SecureStore.
// Phase 0.5 swaps this for an email OTP / magic-link challenge.
export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getToken().then((t) => {
      if (t) router.replace("/projects");
    });
  }, [router]);

  async function onSubmit() {
    if (!email.trim()) {
      setError("email required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.login(email.trim().toLowerCase(), name.trim() || undefined);
      setToken(token);
      await saveToken(token);
      router.replace("/projects");
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>Rankenstein</Text>
        <Text style={styles.subtitle}>
          Sign in to review, approve, and publish from your phone.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="you@company.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Name (optional)"
          value={name}
          onChangeText={setName}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={onSubmit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  card: { gap: 12 },
  brand: { fontSize: 32, fontWeight: "800" },
  subtitle: { color: "#666", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 14, fontSize: 16 },
  button: { backgroundColor: "#000", borderRadius: 8, padding: 16, alignItems: "center", marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#c0392b" },
});
