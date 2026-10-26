export const privateRealtimeEnabled = process.env.EXPO_PUBLIC_PRIVATE_REALTIME_ENABLED === 'true';
export const nativeRealtimeOptions = { config: { private: privateRealtimeEnabled } };
export const nativeRealtimeTopic = (topic: string) => privateRealtimeEnabled ? `shadowchat:db:${topic}` : topic;
