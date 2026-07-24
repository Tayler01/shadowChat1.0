import Ajv from 'ajv'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  NOTIFICATION_ACTION_KEYS,
  NOTIFICATION_ANDROID_CHANNEL_KEYS,
  NOTIFICATION_BADGE_CATEGORIES,
  NOTIFICATION_ENVELOPE_VERSION,
  NOTIFICATION_PRESENTATION_CATEGORIES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_PRIVACY_MODES,
  NOTIFICATION_SOUND_IDS,
  buildNotificationEnvelopeV2,
  getEnvelopeVisibleContent,
  getNotificationPrimaryActionLabel,
  isNotificationEnvelopeV2,
  normalizeNotificationMediaUrl,
} from '../src/features/notifications/notificationEnvelopeV2'
import {
  buildNotificationDeliveryEnvelopeV2,
  normalizeNotificationDeliveryMediaUrl,
} from '../supabase/functions/_shared/notification-envelope-v2'
import {
  normalizeNativeNotificationMediaUrl,
  parseNotificationEnvelopeV2,
} from '../apps/mobile/src/types/notification-envelope-v2'
import type {
  NotificationEventRecord,
  NotificationPresentation,
} from '../src/features/notifications/notificationModel'

const now = new Date(Date.now() - 1_000)
const notificationMediaBase =
  'https://shsqqouecvdoifzufkqm.supabase.co/storage/v1/object/public'

const event = (
  overrides: Partial<NotificationEventRecord> = {},
): NotificationEventRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  type: 'dm_message',
  category: 'dm',
  entity_id: '33333333-3333-4333-8333-333333333333',
  conversation_id: '44444444-4444-4444-8444-444444444444',
  message_id: null,
  dm_message_id: '33333333-3333-4333-8333-333333333333',
  actor_id: '55555555-5555-4555-8555-555555555555',
  route: '/?view=dms&conversation=44444444-4444-4444-8444-444444444444',
  payload: {
    actor: {
      id: '55555555-5555-4555-8555-555555555555',
      display_name: 'JJ',
    },
  },
  sent_at: null,
  read_at: null,
  presented_at: null,
  resolved_at: null,
  created_at: now.toISOString(),
  presentation_expires_at: new Date(Date.now() + 90_000).toISOString(),
  ...overrides,
})

const presentation = (
  source: NotificationEventRecord,
  overrides: Partial<NotificationPresentation> = {},
): NotificationPresentation => ({
  event: source,
  title: 'JJ',
  body: 'The midnight room is open.',
  route: source.route ?? '/?view=catchup',
  actorLabel: 'JJ',
  avatarUrl: `${notificationMediaBase}/avatars/jj.jpg`,
  autoRead: false,
  ...overrides,
})

describe('notification envelope v2', () => {
  test('maps a DM into one canonical rich, actionable envelope', () => {
    const source = event()
    const envelope = buildNotificationEnvelopeV2(source, presentation(source))

    expect(envelope).toMatchObject({
      schemaVersion: 2,
      eventId: source.id,
      eventIds: [source.id],
      category: 'dm',
      groupKey: `dm:${source.conversation_id}`,
      priority: 'high',
      soundId: 'shadow_whisper',
      androidChannelKey: 'messages_v1',
      badgeCategory: 'dm',
      actions: ['open', 'mark_read'],
    })
    expect(envelope.actor).toEqual({
      id: source.actor_id,
      label: 'JJ',
      avatarUrl: `${notificationMediaBase}/avatars/jj.jpg`,
    })
    expect(getNotificationPrimaryActionLabel(source.type)).toBe('Open DM')
    expect(isNotificationEnvelopeV2(envelope)).toBe(true)
  })

  test('applies sender-only and private lock-screen redaction before delivery', () => {
    const source = event({
      type: 'shadow_pin_post',
      category: 'shadow_pin',
      payload: {
        thumbnail_url: `${notificationMediaBase}/shadow-pin/pin.jpg`,
        media_kind: 'image',
        title: 'Night flight',
      },
    })
    const full = buildNotificationEnvelopeV2(source, presentation(source))
    const senderOnly = buildNotificationEnvelopeV2(
      source,
      presentation(source),
      { previewMode: 'sender_only' },
    )
    const privateEnvelope = buildNotificationEnvelopeV2(
      source,
      presentation(source),
      { previewMode: 'private' },
    )

    expect(full.media?.thumbnailUrl).toBe(
      `${notificationMediaBase}/shadow-pin/pin.jpg`,
    )
    expect(getEnvelopeVisibleContent(senderOnly)).toEqual({
      title: 'JJ',
      body: 'Open ShadowChat to view it.',
      actor: senderOnly.actor,
      media: null,
    })
    expect(getEnvelopeVisibleContent(privateEnvelope)).toEqual({
      title: 'New ShadowChat notification',
      body: 'Open ShadowChat to view it.',
      actor: null,
      media: null,
    })
    expect(privateEnvelope.actor).toBeNull()
    expect(privateEnvelope.media).toBeNull()
  })

  test('fails closed on external routes, unsafe media, and unknown types', () => {
    const source = event({
      type: 'unrecognized_future_event',
      category: 'system',
      payload: { thumbnail_url: 'javascript:alert(1)' },
    })
    const envelope = buildNotificationEnvelopeV2(
      source,
      presentation(source, {
        route: 'https://attacker.example/steal',
        avatarUrl: 'data:text/html,bad',
      }),
    )

    expect(envelope.route).toBe('/?view=catchup')
    expect(envelope.media).toBeNull()
    expect(envelope.actor?.avatarUrl).toBeNull()
    expect(envelope.category).toBe('system')
    expect(envelope.soundId).toBe('system_default')
    expect(getNotificationPrimaryActionLabel(source.type)).toBe('Open')
  })

  test('accepts only approved HTTPS notification media across web, Edge, and native', () => {
    const approved = `${notificationMediaBase}/avatars/jj.jpg`
    const unsafe = [
      'http://shadochat.online/avatar.jpg',
      'https://user:password@shadochat.online/avatar.jpg',
      'https://shadochat.online:444/avatar.jpg',
      'https://localhost/avatar.jpg',
      'https://127.0.0.1/avatar.jpg',
      'https://10.0.0.5/avatar.jpg',
      'https://192.168.1.10/avatar.jpg',
      'https://attacker.example/avatar.jpg',
      'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/private-image',
      `https://shadochat.online/${'x'.repeat(2048)}`,
    ]

    expect(normalizeNotificationMediaUrl(approved)).toBe(approved)
    expect(normalizeNotificationDeliveryMediaUrl(approved)).toBe(approved)
    expect(normalizeNativeNotificationMediaUrl(approved)).toBe(approved)

    for (const candidate of unsafe) {
      expect(normalizeNotificationMediaUrl(candidate)).toBeNull()
      expect(normalizeNotificationDeliveryMediaUrl(candidate)).toBeNull()
      expect(normalizeNativeNotificationMediaUrl(candidate)).toBeNull()
    }

    expect(normalizeNotificationDeliveryMediaUrl(
      'https://shsqqouecvdoifzufkqm.supabase.co/storage/v1/render/image/public/avatars/user/avatar.jpg?width=240&quality=82'
    )).toBe(
      'https://shsqqouecvdoifzufkqm.supabase.co/storage/v1/object/public/avatars/user/avatar.jpg'
    )
  })

  test('validates golden web and Edge envelopes against the executable JSON schema', () => {
    const schema = JSON.parse(
      readFileSync(
        path.resolve(process.cwd(), 'contracts/notification-envelope-v2.schema.json'),
        'utf8',
      ),
    ) as Record<string, unknown>
    const schemaForAjv = { ...schema }
    delete schemaForAjv.$schema
    const validate = new Ajv({
      allErrors: true,
      schemaId: 'auto',
    }).compile(schemaForAjv)
    const source = event({
      type: 'shadow_pin_post',
      category: 'shadow_pin',
      payload: {
        thumbnail_url: `${notificationMediaBase}/shadow-pin/pin.jpg`,
        media_kind: 'image',
      },
    })
    const webEnvelopes = (['full', 'sender_only', 'private'] as const).map(
      previewMode => buildNotificationEnvelopeV2(
        source,
        presentation(source),
        { previewMode },
      ),
    )
    const edgeEnvelope = buildNotificationDeliveryEnvelopeV2(
      {
        event_id: source.id,
        user_id: source.user_id,
        category_key: 'shadow_pin',
        title: 'JJ shared a ShadowPin',
        body: 'Night flight',
        private_title: 'New ShadowChat notification',
        private_body: 'Open ShadowChat to view it.',
        actor_id: source.actor_id,
        route: '/?view=pins&pin=33333333-3333-4333-8333-333333333333',
        group_key: `pin:${source.entity_id}`,
        priority: 'normal',
        action_keys: ['open', 'mark_read'],
        sound_id: 'pin_shutter',
        android_channel_key: 'social_v1',
        badge_category: 'shadow_pin',
        media_ref: { kind: 'shadow_pin', image_id: source.entity_id },
        created_at: source.created_at,
        expires_at: source.presentation_expires_at,
      },
      {
        previewMode: 'full',
        eventType: source.type,
        entityId: source.entity_id,
        actor: {
          id: source.actor_id!,
          label: 'JJ',
          avatarUrl: `${notificationMediaBase}/avatars/jj.jpg`,
        },
        media: {
          kind: 'image',
          thumbnailUrl: `${notificationMediaBase}/shadow-pin/pin.jpg`,
          alt: 'Night flight',
        },
      },
    )

    for (const envelope of [...webEnvelopes, edgeEnvelope]) {
      expect(validate(envelope)).toBe(true)
      expect(validate.errors).toBeNull()
      expect(isNotificationEnvelopeV2(envelope)).toBe(true)
      expect(parseNotificationEnvelopeV2(envelope)).not.toBeNull()
    }
  })

  test('rejects golden contract drift in schema, web, and native validators', () => {
    const schema = JSON.parse(
      readFileSync(
        path.resolve(process.cwd(), 'contracts/notification-envelope-v2.schema.json'),
        'utf8',
      ),
    ) as Record<string, unknown>
    const schemaForAjv = { ...schema }
    delete schemaForAjv.$schema
    const validate = new Ajv({
      allErrors: true,
      schemaId: 'auto',
    }).compile(schemaForAjv)
    const source = event()
    const valid = buildNotificationEnvelopeV2(source, presentation(source))
    const clone = () => JSON.parse(JSON.stringify(valid)) as Record<string, unknown>
    const missingPrivateTitle = clone()
    delete (missingPrivateTitle.content as Record<string, unknown>).privateTitle
    const emptyType = { ...clone(), type: '' }
    const duplicateIds = {
      ...clone(),
      eventIds: [valid.eventId, valid.eventId],
    }
    const extraProperty = { ...clone(), unexpected: true }

    for (const invalid of [
      missingPrivateTitle,
      emptyType,
      duplicateIds,
      extraProperty,
    ]) {
      expect(validate(invalid)).toBe(false)
      expect(isNotificationEnvelopeV2(invalid)).toBe(false)
      expect(parseNotificationEnvelopeV2(invalid)).toBeNull()
    }

    const unsafeMedia = clone()
    unsafeMedia.media = {
      kind: 'image',
      thumbnailUrl: 'https://localhost/pin.jpg',
      alt: 'Unsafe',
    }
    expect(validate(unsafeMedia)).toBe(true)
    expect(isNotificationEnvelopeV2(unsafeMedia)).toBe(false)
    expect(parseNotificationEnvelopeV2(unsafeMedia)).toBeNull()
  })

  test('keeps schema enums and required fields aligned with the runtime contract', () => {
    const schema = JSON.parse(
      readFileSync(
        path.resolve(process.cwd(), 'contracts/notification-envelope-v2.schema.json'),
        'utf8',
      ),
    ) as {
      required: string[]
      properties: {
        schemaVersion: { const: number }
        category: { enum: string[] }
        priority: { enum: string[] }
        privacy: { enum: string[] }
        actions: { items: { enum: string[] } }
        soundId: { enum: string[] }
        androidChannelKey: { enum: string[] }
        badgeCategory: { enum: string[] }
      }
    }

    expect(schema.properties.schemaVersion.const).toBe(
      NOTIFICATION_ENVELOPE_VERSION,
    )
    expect(schema.properties.category.enum).toEqual(
      NOTIFICATION_PRESENTATION_CATEGORIES,
    )
    expect(schema.properties.priority.enum).toEqual(NOTIFICATION_PRIORITIES)
    expect(schema.properties.privacy.enum).toEqual(NOTIFICATION_PRIVACY_MODES)
    expect(schema.properties.actions.items.enum).toEqual(NOTIFICATION_ACTION_KEYS)
    expect(schema.properties.soundId.enum).toEqual(NOTIFICATION_SOUND_IDS)
    expect(schema.properties.androidChannelKey.enum).toEqual(
      NOTIFICATION_ANDROID_CHANNEL_KEYS,
    )
    expect(schema.properties.badgeCategory.enum).toEqual(
      NOTIFICATION_BADGE_CATEGORIES,
    )
    expect(schema.required).toEqual(expect.arrayContaining([
      'actor',
      'media',
      'badgeCategory',
      'autoRead',
    ]))
  })
})
