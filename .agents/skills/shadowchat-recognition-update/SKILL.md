---
name: shadowchat-recognition-update
description: Use when publishing a ShadowChat requester recognition popup and Shado post for a shipped feature request or bug report. Pulls the submitter profile media, publishes a notice-only app release, posts from shado_ai, hypes the post to 5, and verifies the result.
---

# ShadowChat Recognition Update

## Overview

Use this skill when Tayler wants to recognize a ShadowChat user whose request or
bug report was added to the app. The workflow publishes two surfaces:

- an in-app update popup using `public.app_releases`
- a General Chat announcement from `shado_ai`

The popup carries a `kind: "recognition"` app-release section with the submitter
avatar, banner, username, display name, submission metadata, and shipped feature
title. The Shado post is always hyped to 5 so the existing full-post featured
glow activates.

## Workflow

1. Confirm the shipped feature and requester.
   - Prefer a `feedback_submissions.id` when available.
   - If only a username is provided, resolve it from `public.users`.
2. Run a dry run first:

   ```powershell
   node .agents/skills/shadowchat-recognition-update/scripts/publish-recognition-update.mjs --username jj --submission-id 0f99199c-89a5-4113-8633-c8cd2867165b --feature-title "Full-screen photo pinch zoom" --dry-run
   ```

3. Review the generated release row, Shado post text, and hype target.
4. Run without `--dry-run` to publish.
5. Verify the script summary:
   - `release.published` is true unless `--skip-popup` was used.
   - `post.messageId` is present unless `--skip-post` was used.
   - `post.hypeCount` is at least 5.

## Script

Use `scripts/publish-recognition-update.mjs`.

Common options:

- `--username jj`: requester username.
- `--user-id <uuid>`: requester user id.
- `--submission-id <uuid>`: feedback submission to credit.
- `--feature-title "Full-screen photo pinch zoom"`: shipped feature name.
- `--display-name "JJ"`: presentation override while still pulling the matched user's media.
- `--submission-title "Zoom feature on photos"`: fallback if no submission row is used.
- `--summary "..."`: popup summary override.
- `--title "..."`: popup title override.
- `--build-id "recognition-20260618-jj-pinch-zoom"`: idempotent app release key.
- `--hype-target 5`: desired post hype count; defaults to 5.
- `--force`: allow a second post when a matching recent post exists.
- `--skip-popup` or `--skip-post`: publish only one surface.
- `--dry-run`: inspect without writing app releases, messages, hypes, or broadcasts.

The script loads `.env`, `.env.local`, and `.env.production`. It needs
`SUPABASE_URL` or `VITE_SUPABASE_URL` and a service-role key. If
`SUPABASE_SERVICE_ROLE_KEY` is missing, it attempts `supabase projects api-keys`
for the linked project and never prints the key.

## Safety Rules

- Never expose service-role keys, provider tokens, or private credentials.
- Use the database insert path for Shado posts, not browser automation.
- Keep recognition app releases `notice_only` unless Tayler explicitly asks for
  a restart gate.
- Do not mark feedback submissions closed from this skill unless Tayler asks.
- If the script reports a live write failure, report the exact status/body and
  do not hide it with a manual workaround.
