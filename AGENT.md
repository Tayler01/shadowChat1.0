# Agent Guide

Canonical agent instructions for this repo are mirrored here for tools and workflows that look for `AGENT.md` instead of `AGENTS.md`.

## Documentation Status - June 1, 2026

This file is intentionally short. The canonical current handbook is [AGENTS.md](C:/repos/chat2.0/AGENTS.md:1). Current audit follow-ups are tracked in [docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1), and the documentation inventory is [docs/PROJECT_DOCUMENTATION_RUNDOWN_2026-06-01.md](C:/repos/chat2.0/docs/PROJECT_DOCUMENTATION_RUNDOWN_2026-06-01.md:1).

## Required Checks

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

## Key Files

- [`src/App.tsx`](C:/repos/chat2.0/src/App.tsx:1)
- [`src/hooks/useAuth.tsx`](C:/repos/chat2.0/src/hooks/useAuth.tsx:1)
- [`src/hooks/useMessages.tsx`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
- [`src/hooks/useDirectMessages.tsx`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)
- [`src/hooks/useAdminAccess.ts`](C:/repos/chat2.0/src/hooks/useAdminAccess.ts:1)
- [`src/hooks/useWeatherPreference.ts`](C:/repos/chat2.0/src/hooks/useWeatherPreference.ts:1)
- [`src/hooks/useWeatherForecast.ts`](C:/repos/chat2.0/src/hooks/useWeatherForecast.ts:1)
- [`src/lib/supabase.ts`](C:/repos/chat2.0/src/lib/supabase.ts:1)
- [`src/lib/push.ts`](C:/repos/chat2.0/src/lib/push.ts:1)
- [`src/lib/weather.ts`](C:/repos/chat2.0/src/lib/weather.ts:1)
- [`supabase/functions/openai-chat/index.ts`](C:/repos/chat2.0/supabase/functions/openai-chat/index.ts:1)
- [`supabase/functions/send-push/index.ts`](C:/repos/chat2.0/supabase/functions/send-push/index.ts:1)
- [`docs/ADMIN_ACCESS.md`](C:/repos/chat2.0/docs/ADMIN_ACCESS.md:1)
- [`docs/WEATHER_WIDGET.md`](C:/repos/chat2.0/docs/WEATHER_WIDGET.md:1)
- [`docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md`](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1)
- [`docs/PROJECT_DOCUMENTATION_RUNDOWN_2026-06-01.md`](C:/repos/chat2.0/docs/PROJECT_DOCUMENTATION_RUNDOWN_2026-06-01.md:1)

## Testing

Run targeted unit coverage when possible:

```powershell
npx jest --runInBand
```

For stable UI debugging, prefer preview mode:

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4174
```

Use headed Playwright or inline Node scripts with the installed `playwright` package for realtime and visual checks. Save screenshots under `output/playwright/`.

## Visual And UX Rules

- Keep the obsidian-and-gold design system consistent.
- Avoid off-theme bright default accents.
- Re-check mobile layouts after shell, DM, chat, settings, active-user, or weather changes.

## Read Before Editing

For the full agent handbook, use [AGENTS.md](C:/repos/chat2.0/AGENTS.md:1).
