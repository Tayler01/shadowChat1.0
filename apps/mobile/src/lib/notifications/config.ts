import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type {
  NotificationCategoryV2,
  NotificationSoundId,
} from '@/types/notification-envelope-v2';

export const NOTIFICATION_CHANNEL_SCHEMA_VERSION = 2;

export const notificationSoundFiles: Record<
  Exclude<NotificationSoundId, 'system_default' | 'silent'>,
  string
> = {
  shadow_whisper: 'shadow_whisper.wav',
  low_glass: 'low_glass.wav',
  gold_signal: 'gold_signal.wav',
  hype_burst: 'hype_burst.wav',
  pin_shutter: 'pin_shutter.wav',
  connection_chime: 'connection_chime.wav',
  presence_pulse: 'presence_pulse.wav',
  live_beacon: 'live_beacon.wav',
  checkers_move: 'checkers_move.wav',
  war_drum: 'war_drum.wav',
  weather_glass: 'weather_glass.wav',
  security_signal: 'security_signal.wav',
};

export const getNativeSoundFile = (soundId: NotificationSoundId) => {
  if (soundId === 'silent') return null;
  if (soundId === 'system_default') return 'default';
  return notificationSoundFiles[soundId];
};

const soundLabels: Record<NotificationSoundId, string> = {
  shadow_whisper: 'Shadow Whisper',
  low_glass: 'Low Glass',
  gold_signal: 'Gold Signal',
  hype_burst: 'Hype Burst',
  pin_shutter: 'Pin Shutter',
  connection_chime: 'Connection Chime',
  presence_pulse: 'Presence Pulse',
  live_beacon: 'Live Beacon',
  checkers_move: 'Checkers Move',
  war_drum: 'War Drum',
  weather_glass: 'Weather Glass',
  security_signal: 'Security Signal',
  system_default: 'System Default',
  silent: 'Silent',
};

const soundIds = Object.keys(soundLabels) as NotificationSoundId[];
const SOUND_CHANNEL_GROUP = 'shadowchat_notification_sounds';

export const getAndroidSoundChannelId = (soundId: NotificationSoundId) =>
  `shadowchat_sound_${soundId}_v${NOTIFICATION_CHANNEL_SCHEMA_VERSION}`;

export const androidChannelIds = {
  messages_v1: 'shadowchat_messages_v1',
  mentions_v1: 'shadowchat_mentions_v1',
  social_v1: 'shadowchat_social_v1',
  live_v1: 'shadowchat_live_v1',
  games_v1: 'shadowchat_games_v1',
  weather_v1: 'shadowchat_weather_v1',
  security_v1: 'shadowchat_security_v1',
} as const;

const channelDefinitions: Array<{
  key: keyof typeof androidChannelIds;
  name: string;
  description: string;
  sound: string;
  importance: Notifications.AndroidImportance;
}> = [
  {
    key: 'messages_v1',
    name: 'Messages',
    description: 'Direct messages and General Chat',
    sound: notificationSoundFiles.shadow_whisper,
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    key: 'mentions_v1',
    name: 'Mentions and replies',
    description: 'Messages directed to you',
    sound: notificationSoundFiles.gold_signal,
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    key: 'social_v1',
    name: 'Social and ShadowPin',
    description: 'Reactions, Hype, Connections, presence, and Pins',
    sound: notificationSoundFiles.connection_chime,
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  {
    key: 'live_v1',
    name: 'Shado Live',
    description: 'Rooms and stage changes',
    sound: notificationSoundFiles.live_beacon,
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    key: 'games_v1',
    name: 'Games',
    description: 'Turns and game updates',
    sound: notificationSoundFiles.checkers_move,
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    key: 'weather_v1',
    name: 'Weather',
    description: 'Eligible severe weather alerts',
    sound: notificationSoundFiles.weather_glass,
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    key: 'security_v1',
    name: 'Security',
    description: 'Account and device warnings',
    sound: notificationSoundFiles.security_signal,
    importance: Notifications.AndroidImportance.HIGH,
  },
];

export const getNativeCategoryIdentifier = (
  category: NotificationCategoryV2
) => {
  if (category === 'dm' || category === 'general_chat' || category === 'mentions_replies') {
    return 'shadowchat_message';
  }
  if (category === 'shadow_checkers' || category === 'shadow_war') {
    return 'shadowchat_game_turn';
  }
  if (
    category === 'shadow_pin' ||
    category === 'connections' ||
    category === 'presence' ||
    category === 'reactions_hype'
  ) {
    return 'shadowchat_social';
  }
  return 'shadowchat_open';
};

export const configureNativeNotifications = async () => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
  });

  await Promise.all([
    Notifications.setNotificationCategoryAsync('shadowchat_message', [
      {
        identifier: 'open',
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'mark_read',
        buttonTitle: 'Mark Read',
        options: { opensAppToForeground: true },
      },
    ]),
    Notifications.setNotificationCategoryAsync('shadowchat_social', [
      {
        identifier: 'open',
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'mark_read',
        buttonTitle: 'Mark Read',
        options: { opensAppToForeground: true },
      },
    ]),
    Notifications.setNotificationCategoryAsync('shadowchat_game_turn', [
      {
        identifier: 'open',
        buttonTitle: 'Play',
        options: { opensAppToForeground: true },
      },
    ]),
    Notifications.setNotificationCategoryAsync('shadowchat_open', [
      {
        identifier: 'open',
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
    ]),
  ]);

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelGroupAsync(
      SOUND_CHANNEL_GROUP,
      {
        name: 'ShadowChat notification sounds',
        description: 'Sound choices managed from ShadowChat notification settings',
      }
    );
    await Promise.all([
      ...channelDefinitions.map(channel =>
        Notifications.setNotificationChannelAsync(androidChannelIds[channel.key], {
          name: channel.name,
          description: channel.description,
          importance: channel.importance,
          sound: channel.sound,
          enableVibrate: true,
          vibrationPattern: [0, 180, 90, 180],
          lightColor: '#E9C766',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        })
      ),
      ...soundIds.map(soundId => {
        const silent = soundId === 'silent';
        return Notifications.setNotificationChannelAsync(
          getAndroidSoundChannelId(soundId),
          {
            name: soundLabels[soundId],
            description: `ShadowChat alerts using ${soundLabels[soundId]}`,
            groupId: SOUND_CHANNEL_GROUP,
            importance: silent
              ? Notifications.AndroidImportance.LOW
              : Notifications.AndroidImportance.HIGH,
            sound: getNativeSoundFile(soundId),
            enableVibrate: !silent,
            vibrationPattern: silent ? [0] : [0, 180, 90, 180],
            lightColor: '#E9C766',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
            showBadge: true,
          }
        );
      }),
    ]);
  }
};
