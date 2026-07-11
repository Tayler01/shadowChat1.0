# ShadowChat 2.0 - Wave One

## Goal

Build and validate the first high-impact 2.0 product wave on the long-lived
`codex/shadowchat-2.0` branch, using the existing production Supabase project
through additive, backward-compatible contracts. Production `main` and its
Netlify frontend remain unchanged until Tayler approves the completed fork.

The completed wave will be deployed to a separate Netlify site and installable
URL for phone testing.

## Candidate Sequence

1. **Unified Activity HQ** - implemented locally and fully verified. See
   [ACTIVITY_HQ.md](C:/repos/chat2.0/docs/ACTIVITY_HQ.md:1).
2. **Immersive ShadowPin viewer** - pending implementation checkpoint.
3. **DM Conversation Hub** - pending implementation checkpoint.
4. **Member reporting and operator case center** - pending implementation
   checkpoint.
5. **App-wide accessibility and comfort system** - pending implementation
   checkpoint.

Each candidate gets its own research, focused implementation, tests, browser
proof, documentation update, and checkpoint commit. Combined regression and
shared-backend compatibility verification run after all five candidates.

## Release Boundaries

- No 2.0 frontend change is pushed to production `main` during the trial.
- Shared Supabase changes must be additive, RLS-preserving, and compatible with
  both frontends.
- Any migration applied remotely must remain canonical and be included in the
  eventual main history even if a frontend candidate is rejected.
- Boards, News, Art Board, and ESP Bridge remain paused.
- The 2.0 site gets a distinct Netlify identity, URL, and deployment authority.
- Production environment variables, domain bindings, and deploy hooks are not
  reassigned to the 2.0 site.

## Wave Completion Gate

Wave One is complete only when all five candidates pass lint, TypeScript,
production build/budgets, relevant Jest and SQL verification, actual WebKit and
Chromium phone QA, linked Supabase compatibility checks, full regression, and a
separate Netlify deploy smoke. Tayler then reviews the installable 2.0 URL.
