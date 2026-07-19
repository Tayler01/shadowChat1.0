import { useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getNotificationWebUrl, normalizeNotificationRoute } from '@/lib/notifications/routes';

export default function NotificationTargetScreen() {
  const params = useLocalSearchParams<{
    route?: string | string[];
    title?: string | string[];
  }>();
  const route = normalizeNotificationRoute(
    Array.isArray(params.route) ? params.route[0] : params.route
  );
  const title = Array.isArray(params.title) ? params.title[0] : params.title;
  const webUrl = useMemo(() => getNotificationWebUrl(route), [route]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Notification destination</Text>
        <Text style={styles.title}>{title || 'Open this ShadowChat update'}</Text>
        <Text style={styles.body}>
          This native preview does not contain this full feature yet. Continue securely in the production ShadowChat app.
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            void Linking.openURL(webUrl);
          }}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>Open in ShadowChat</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#050505',
    padding: 20,
  },
  card: {
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(233, 199, 102, 0.26)',
    borderRadius: 24,
    backgroundColor: '#101112',
    padding: 22,
  },
  eyebrow: {
    color: '#E9C766',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#F7F0DE',
    fontSize: 24,
    fontWeight: '800',
  },
  body: {
    color: '#A69B82',
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#E9C766',
  },
  buttonText: {
    color: '#050505',
    fontSize: 15,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
  },
});
