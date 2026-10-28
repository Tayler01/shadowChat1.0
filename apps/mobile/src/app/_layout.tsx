import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { NativeNotificationsProvider } from '@/hooks/useNativeNotifications';
import { NativeCommunityBoundary } from '@/community/NativeCommunityBoundary';

export default function RootLayout() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync('#050505');
  }, []);

  return (
    <NativeCommunityBoundary><NativeNotificationsProvider>
      <Stack
          screenOptions={{
            contentStyle: { backgroundColor: '#050505' },
            headerShown: false,
          }}
        >
          <Stack.Screen name="index" />
        </Stack>
        <StatusBar style="light" />
    </NativeNotificationsProvider></NativeCommunityBoundary>
  );
}
