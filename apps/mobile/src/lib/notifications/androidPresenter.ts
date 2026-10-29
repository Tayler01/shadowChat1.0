import notifee, {
  AndroidCategory,
  AndroidGroupAlertBehavior,
  AndroidStyle,
  AndroidVisibility,
  type Notification,
  type NotificationAndroid,
} from '@notifee/react-native';

import { getAndroidSoundChannelId } from './config';
import { appRuntime } from '../appRuntime';
import {currentTransportScope,readTransportScope} from '../../community/communityBindings';
import {
  parseNotificationEnvelopeV2,
  type NotificationEnvelopeV2,
} from '@/types/notification-envelope-v2';

const SUMMARY_PREFIX = 'shadowchat-summary:';

const scopedIdentity = (scope: unknown) => {
  const value=readTransportScope({communityScope:scope});
  return value?.version===1 && typeof value.projectRef==='string' && typeof value.userId==='string' && typeof value.installationKey==='string'
    ? `${value.projectRef}:${value.userId}:${value.installationKey}` : null;
};
const notificationId=(value:string,scope:unknown)=>appRuntime.streamlined ? `${scopedIdentity(scope)}:${value}` : value;
const sameScope=(data:unknown,scope:unknown)=>!appRuntime.streamlined || (scopedIdentity(scope)!==null && scopedIdentity(readTransportScope(data))===scopedIdentity(scope));

const stringData = (envelope: NotificationEnvelopeV2,transportScope:unknown=currentTransportScope()) => ({
  envelopeV2: JSON.stringify(appRuntime.streamlined ? {
    ...envelope,
    actor: envelope.actor ? { ...envelope.actor, avatarUrl: null } : null,
    media: null,
  } : envelope),
  communityScope: JSON.stringify(transportScope),
  eventId: envelope.eventId,
  groupKey: envelope.groupKey,
  route: envelope.route,
});

const notificationBody = (envelope: NotificationEnvelopeV2) => {
  if (envelope.privacy === 'private') {
    return envelope.content.privateBody ?? 'Open ShadowChat to view it.';
  }
  if (envelope.privacy === 'sender_only') {
    return 'Open ShadowChat to view it.';
  }
  return envelope.content.body ?? '';
};

const androidCategory = (envelope: NotificationEnvelopeV2) => {
  if (
    envelope.category === 'dm' ||
    envelope.category === 'general_chat' ||
    envelope.category === 'mentions_replies'
  ) return AndroidCategory.MESSAGE;
  if (
    envelope.category === 'shadow_checkers' ||
    envelope.category === 'shadow_war'
  ) return AndroidCategory.RECOMMENDATION;
  if (envelope.category === 'shado_live') return AndroidCategory.EVENT;
  if (envelope.category === 'weather') return AndroidCategory.REMINDER;
  return AndroidCategory.SOCIAL;
};

const androidStyle = (
  envelope: NotificationEnvelopeV2
): NotificationAndroid['style'] => {
  const actor = envelope.privacy === 'private' ? null : envelope.actor;
  const body = notificationBody(envelope);
  if (
    envelope.category === 'dm' ||
    envelope.category === 'general_chat' ||
    envelope.category === 'mentions_replies'
  ) {
    return {
      type: AndroidStyle.MESSAGING,
      person: {
        name: 'You',
      },
      messages: [
        {
          text: body || envelope.content.title,
          timestamp: Date.parse(envelope.createdAt),
          person: {
            ...(actor?.id ? { id: actor.id } : {}),
            name: actor?.label ?? envelope.content.title,
            ...(!appRuntime.streamlined && actor?.avatarUrl ? { icon: actor.avatarUrl } : {}),
          },
        },
      ],
      group: envelope.category === 'general_chat',
    };
  }
  if (
    !appRuntime.streamlined && envelope.privacy === 'full' &&
    envelope.media?.thumbnailUrl
  ) {
    return {
      type: AndroidStyle.BIGPICTURE,
      picture: envelope.media.thumbnailUrl,
      title: envelope.content.title,
      summary: body,
    };
  }
  return {
    type: AndroidStyle.BIGTEXT,
    text: body || envelope.content.title,
  };
};

const summaryEnvelope = (
  envelopes: NotificationEnvelopeV2[],
  groupKey: string
) => {
  const latest = envelopes.at(-1);
  if (!latest) return null;
  const eventIds = Array.from(new Set(
    envelopes.flatMap(envelope => envelope.eventIds)
  )).slice(-32);
  return {
    ...latest,
    eventId: latest.eventId,
    eventIds,
    groupKey,
    route: '/catch-up',
    content: {
      eyebrow: 'ShadowChat',
      title: `${envelopes.length} updates`,
      body: 'Open ShadowChat to catch up.',
      privateTitle: `${envelopes.length} ShadowChat updates`,
      privateBody: 'Open ShadowChat to catch up.',
    },
    media: null,
  } satisfies NotificationEnvelopeV2;
};

export const reconcileAndroidNotificationGroups = async (
  targetGroupKeys?: Iterable<string>,
  transportScope:unknown=currentTransportScope(),
) => {
  if(appRuntime.streamlined && !scopedIdentity(transportScope))return;
  const displayed = (await notifee.getDisplayedNotifications()).filter(item=>sameScope(item.notification.data,transportScope));
  const requested = targetGroupKeys
    ? new Set(targetGroupKeys)
    : new Set(
        displayed
          .map(item => item.notification.data?.groupKey)
          .filter((groupKey): groupKey is string => typeof groupKey === 'string')
      );

  await Promise.all(Array.from(requested).map(async groupKey => {
    const children = displayed
      .filter(item =>
        item.notification.data?.groupKey === groupKey &&
        item.notification.id !== notificationId(`${SUMMARY_PREFIX}${groupKey}`,transportScope)
      )
      .map(item => parseNotifeeEnvelope(item.notification))
      .filter((envelope): envelope is NotificationEnvelopeV2 => Boolean(envelope));
    const summaryId = notificationId(`${SUMMARY_PREFIX}${groupKey}`,transportScope);
    if (children.length < 2) {
      await notifee.cancelNotification(summaryId).catch(() => undefined);
      return;
    }
    const envelope = summaryEnvelope(children, groupKey);
    if (!envelope) return;
    await notifee.displayNotification({
      id: summaryId,
      title: 'ShadowChat',
      body: `${children.length} updates`,
      data: stringData(envelope,transportScope),
      android: {
        channelId: getAndroidSoundChannelId(envelope.soundId),
        groupAlertBehavior: AndroidGroupAlertBehavior.CHILDREN,
        groupId: notificationId(groupKey,transportScope),
        groupSummary: true,
        onlyAlertOnce: true,
        pressAction: { id: 'open', launchActivity: 'default' },
        smallIcon: 'notification_icon',
        color: '#E9C766',
        visibility: AndroidVisibility.PRIVATE,
      },
    });
  }));
};

export const displayAndroidNotificationEnvelope = async (
  envelope: NotificationEnvelopeV2,
  badgeCount = 0,
  transportScope:unknown=currentTransportScope(),
) => {
  const actor = envelope.privacy === 'private' ? null : envelope.actor;
  if(appRuntime.streamlined && !scopedIdentity(transportScope))return;
  const notification: Notification = {
    id: notificationId(envelope.eventId,transportScope),
    title: appRuntime.streamlined ? 'ShadoChat' : envelope.content.title,
    body: appRuntime.streamlined ? 'Open ShadoChat to view your update.' : notificationBody(envelope),
    data: stringData(envelope,transportScope),
    android: {
      channelId: getAndroidSoundChannelId(envelope.soundId),
      category: androidCategory(envelope),
      color: '#E9C766',
      groupAlertBehavior: AndroidGroupAlertBehavior.CHILDREN,
      groupId: notificationId(envelope.groupKey,transportScope),
      largeIcon: appRuntime.streamlined ? undefined : actor?.avatarUrl ?? undefined,
      onlyAlertOnce: true,
      pressAction: { id: 'open', launchActivity: 'default' },
      smallIcon: 'notification_icon',
      style: appRuntime.streamlined ? undefined : androidStyle(envelope),
      visibility: AndroidVisibility.PRIVATE,
      actions: [
        {
          title: envelope.category === 'shadow_checkers' ? 'Play' : 'Open',
          pressAction: { id: 'open', launchActivity: 'default' },
        },
        ...(envelope.actions.includes('mark_read')
          ? [{
              title: 'Mark read',
              pressAction: { id: 'mark_read', launchActivity: 'default' },
            }]
          : []),
      ],
    },
  };
  await notifee.displayNotification(notification);
  await Promise.all([
    notifee.setBadgeCount(
      Math.max(0, Math.min(99, Math.floor(badgeCount)))
    ),
    reconcileAndroidNotificationGroups([envelope.groupKey],transportScope),
  ]);
};

export const parseNotifeeEnvelope = (
  notification: Notification | undefined,
  options: { interaction?: boolean } = {}
) => {
  const raw = notification?.data?.envelopeV2;
  if (typeof raw !== 'string') return null;
  try {
    return parseNotificationEnvelopeV2(JSON.parse(raw), options);
  } catch {
    return null;
  }
};
