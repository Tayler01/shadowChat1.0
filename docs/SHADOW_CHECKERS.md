# Shadow Checkers

Shadow Checkers is the second multiplayer game in the ShadowChat Games area.
It shares the existing Games picker with Shadow War and uses the shared
`game_sessions` / `game_session_queue` lobby spine.

## Rules

- Standard American checkers on an 8x8 board.
- Only dark squares are playable.
- Each player starts with 12 pieces.
- Regular pieces move and capture diagonally forward.
- Crowned pieces move and capture diagonally forward or backward.
- Captures are mandatory.
- Multi-jumps are required when available.
- Promotion ends the move, including during a jump.
- A player wins when the opponent has no pieces, has no legal moves, or resigns.
- There is no timer, undo, AI opponent, or sound in v1.

## Backend

The migration `supabase/migrations/20260512212357_shadow_checkers_domain.sql`
adds:

- `shadow_checkers_matches`
- `shadow_checkers_moves`
- `shadow_checkers_chat_messages`
- `shadow_checkers_stats`
- `users.checkers_crown`
- realtime publication entries for Checkers tables
- RPCs for create, join, queue, leave queue, submit move, resign, cancel, and
  temporary match chat

Critical game actions are server-resolved through RPCs. The browser does not
directly write board state, winners, match results, stats, or crown badges.

## Frontend

Key files:

- `src/features/games/GamesHome.tsx`
- `src/features/games/shadow-checkers/ShadowCheckersScreen.tsx`
- `src/features/games/shadow-checkers/components/ShadowCheckersBoard.tsx`
- `src/features/games/shadow-checkers/engine/checkers.ts`
- `src/features/games/shadow-checkers/api/shadowCheckersApi.ts`
- `src/features/games/shadow-checkers/hooks/useShadowCheckers.ts`
- `src/features/games/shadow-checkers/assets/manifest.ts`

The board is a mobile-first cinematic 2.5D implementation. It is intentionally
dependency-free for v1 to avoid adding a heavy 3D runtime to the main app bundle.

## QA

Run:

```powershell
npx jest --runInBand tests/shadowCheckersEngine.test.ts
npm run qa:shadow-checkers
```

The DB smoke uses two Playwright test accounts, creates a real match, verifies
the RPC path and stats, then cleans up its smoke data by default.

Use `npm run qa:shadow-checkers -- --keep-data` only when intentionally keeping
the created match data for debugging.

## Known V1 Limits

- The board is polished 2.5D, not WebGL/Three.js.
- Queue entries are available, but the richer next-challenger/rematch handoff is
  intentionally minimal in this first pass.
- Match chat is temporary and only shows recent active-match messages.
