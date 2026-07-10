# Personal Blocking

## Documentation Status - July 10, 2026

This document describes the reciprocal personal-block contract shipped in the
July 10 Release A backend-first deployment. Final release-closeout authority is
the latest successful `main` workflow, clean linked checks, and matching public
health manifest; a forward correction for two unrelated historical table grants
must complete before private-identity Release B proceeds.

## Product Behavior

A member can block or unblock another member from that person's public profile,
from an existing DM header, or from Settings > Blocked users. Only the blocker
can see and manage their private block-list row.

Enforcement is reciprocal even though ownership is one-directional. If either
member blocks the other, the pair cannot:

- discover each other through user search or normal public-profile reads
- see each other in General Chat, active-user, or presence results
- start a DM, send into an existing DM, or react inside that DM
- interact through General Chat reactions, Hype, or message pinning by known id
- discover or engage with each other's ShadowPin categories, pins, hearts,
  comments, replies, or activity targets
- receive each other's foreground events or background push notifications

Existing DM conversations and rows are preserved. While blocked, the inbox
marks the thread unavailable, suppresses its preview and unread count, refreshes
already loaded message state, and hides the message body. Unblocking restores
the preserved history instead of creating a second conversation.

Creating a block also marks unread notification events between the pair as read.
Reaction-count helpers return zero across a blocked relationship so public
aggregates cannot become a side channel.

## Data And Enforcement

Canonical migrations:

- `20260710042701_personal_blocking_privacy_contract.sql`
- `20260710044600_personal_blocking_engagement_hardening.sql`

`public.user_blocks` stores `(blocker_id, blocked_id)` with RLS that permits only
the blocker to select, insert, or delete their rows. The private indexed helper
`private.users_have_block(first_user_id, second_user_id)` is the common
reciprocal check used by RLS, guarded RPCs, and trigger enforcement.

Public member APIs are:

- `block_user(target_user_id)`
- `unblock_user(target_user_id)`
- `get_my_blocked_users()`

RLS is the visibility authority for profiles, presence, General Chat, DMs,
reactions, Hype, ShadowPin, search, and saved-message reads. Trigger checks also
guard trusted or `SECURITY DEFINER` write paths so a caller cannot bypass the
contract merely by knowing an entity id. The hardening migration explicitly
covers message reactions, Hype, ShadowPin category/image hearts, activity,
post creation, comment parents, message pinning, and reaction aggregates.

## ShadowPin Abuse Bounds

The engagement-hardening migration also applies bounded authenticated writes:

- at most 12 ShadowPin posts per minute and 100 per day per creator
- at most 120 live activity events per minute per user
- at most 120 activity sessions per hour per user
- activity metadata must be an object no larger than 4 KB with at most 24 keys
- replies may target only a root comment on the same pin
- normalized tags must be attached to a pin; orphan tags are rejected or
  removed when the last link is deleted

These limits protect the shared engagement paths; they are not operator
moderation or channel bans.

## Frontend Source Map

- `src/hooks/useBlockedUsers.tsx`: app-wide private block state and refresh event
- `src/lib/personalBlocking.ts`: block-list and mutation RPC helpers
- `src/components/profile/BlockUserControl.tsx`: block/unblock confirmation UI
- `src/components/settings/BlockedUsersSettings.tsx`: private management list
- `src/components/dms/BlockedConversationNotice.tsx`: preserved-thread state
- `src/hooks/useDirectMessages.tsx`: conversation/message refresh after changes
- `src/components/dms/DirectMessagesView.tsx`: blocked-thread rendering guard
- `supabase/functions/send-push/index.ts`: server-side delivery suppression

## Verification

Run the relevant coverage after changing this contract:

```powershell
npx jest --runInBand tests/personalBlockingSql.test.ts tests/useBlockedUsers.test.tsx tests/BlockUserControl.test.tsx tests/useDirectMessages.test.tsx
npm run test:node
```

For behavior changes, use two authenticated browser accounts and verify block,
loaded-DM refresh, failed send/reaction, search/presence removal, notification
suppression, unblock restoration, and cleanup. Do not infer production database
state from frontend tests alone; run the linked migration/security checks in the
deployment guide.
