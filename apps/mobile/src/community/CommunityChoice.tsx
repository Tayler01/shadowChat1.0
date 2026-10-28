import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { CommunityId, CommunityRegistry } from './communityRuntime';

/** Visible signed-out choice. Parent MUST resolve native teardown before mounting the chosen WebView. */
export function CommunityChoice({
  registry,
  busy = false,
  error,
  onSelect,
}: {
  registry: CommunityRegistry;
  busy?: boolean;
  error?: string;
  onSelect: (id: CommunityId) => void;
}) {
  return (
    <ScrollView style={styles.surface} contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Choose your community
      </Text>
      <Text style={styles.description}>
        Sign in to your community, or explore the same app with sample members in the demo
        community.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Community"
        disabled={busy}
        accessibilityState={{ disabled: busy }}
        onPress={() => onSelect('member')}
        style={styles.button}
      >
        <Text style={styles.label}>Community</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Demo community"
        disabled={busy || !registry.demo}
        accessibilityState={{ disabled: busy || !registry.demo }}
        onPress={() => onSelect('demo')}
        style={[styles.button, !registry.demo && styles.disabled]}
      >
        <Text style={styles.label}>Demo community</Text>
        <Text style={styles.detail}>
          {registry.demo
            ? 'Sample members. Real app features.'
            : 'The demo community is currently unavailable.'}
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: '#050505' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { color: '#F4E9CF', fontSize: 26, fontWeight: '600' },
  description: { color: '#BEB8AA', fontSize: 16, lineHeight: 24 },
  button: {
    minHeight: 56,
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#76613C',
    borderRadius: 16,
    backgroundColor: '#13110D',
    gap: 6,
  },
  label: { color: '#F4E9CF', fontSize: 17, fontWeight: '600' },
  detail: { color: '#BEB8AA', fontSize: 14, lineHeight: 20 },
  disabled: { opacity: 0.6 },
  error: { color: '#F4E9CF', fontSize: 14, lineHeight: 20 },
});
