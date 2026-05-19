export const createRealtimeChannelName = (baseName: string) =>
  `${baseName}:${Date.now()}:${Math.random().toString(36).slice(2)}`
