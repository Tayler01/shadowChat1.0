import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

export default function RootLayout() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync('#050505');
  }, []);

  return (
    <>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: '#050505' },
          headerLargeTitle: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#050505' },
          headerTintColor: '#E9C766',
          headerTitleStyle: { color: '#F7E7B2', fontWeight: '700' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'ShadowChat' }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
