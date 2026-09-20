# Durable solo progress and private synchronization

## Authority
The simulation owns an attempt; local storage owns immediate durability; existing authenticated Supabase access synchronizes private progress when available. Network is never required for a simulation tick. There is no public leaderboard, reward system or browser anti-cheat claim. Cheats and client modification cannot steal another user's save through the API. [S12]

Use IndexedDB transactions for profiles, immutable attempt summaries, active checkpoints, downloaded-pack metadata and a bounded outbox. Do not put level buffers or per-tick state into React/localStorage. Use existing app facilities where they satisfy this contract. Comfort settings remain device-local under the existing provider; do not silently cloud-sync them.

## Data model
- Identity namespace: authenticated `userId` or a distinct device guest ID. Namespace every local record and clear in-memory references on account switch.
- Pack identity: stable ID + source fingerprint + normalized-content hash + ruleset/version. Same displayed title is not identity. A changed level cannot inherit an incompatible snapshot.
- Attempt: generated UUID, pack hash, level ID, seed, ruleset, started tick, accumulated active ticks, move count, assistance flags and terminal outcome. Do not use wall-clock elapsed time for puzzle timers.
- Checkpoint: versioned schema, monotonic local revision, full deterministic state including PRNG and actor schedules, integrity hash, attempt ID and content identity. This is a consistency check, not cryptographic anti-tamper protection.
- Result: immutable ID for idempotent writes, clear/fail, clean/assisted, actual measured stats; dedupe repeated completion effects.
- Progress: unlocked levels, clean/assisted completion sets, bests derived from results, source campaign metadata and user save preference. Imported unknown content does not enter full-campaign achievements automatically.

## Write timing and recovery
Persist after meaningful state changes with a small debounced cadence (initial target <=1 second), immediately at pause, results and controlled exit, and regularly while active. Do not rely on unload/pagehide finishing an asynchronous write. Maintain last known-good checkpoint plus current transactional commit. Clear input before saving a paused checkpoint. Storage errors must show “device save unavailable” and leave gameplay functional; never falsely claim durability. On load, validate version/content hash/checksum before accepting state. A corrupt save offers last good checkpoint, restart level, export diagnostic and exit—not a silent campaign reset.

Store an event journal or checkpoint chain only within an explicit size cap. Undo is bounded (initially 30 seconds or 150 committed moves, whichever is less); it marks the attempt assisted and must restore PRNG/timers/triggers. Assistance flags are sticky for an attempt and its undo history. Turning codes off cannot turn an assisted run clean. Starting a new clean attempt resets appropriately.

## Cloud behavior and conflicts
Proposed cloud tables: `shadow_circuit_progress`, `shadow_circuit_attempt_results`, and `shadow_circuit_checkpoints`, keyed by caller ownership and content identity. Adapt names to existing conventions after schema discovery. Never create a new auth project/client or store service-role credentials in the frontend.

Use caller-bound RLS on every exposed table, explicit grants, `USING` plus `WITH CHECK` for updates. Users cannot change `user_id`, read another user's records, or list other users' local pack hints/checkpoints. `TO authenticated` is not an ownership check. Prefer security-invoker RPCs/queries; do not add a definer merely to bypass a failing test. No admin privileges needed for ordinary game saves. Prepare and test migrations locally; no production/linked apply in this task. [S12]

Checkpoint sync uses optimistic concurrency (`revision`/compare-and-swap or equivalent existing architecture). A conditional update that writes zero rows triggers a read and conflict resolution, not a success toast. Never resolve active-attempt conflicts by blindly comparing untrusted device clocks. Keep distinct attempt IDs; merge immutable results by ID and union completed/unlocked sets where the rules allow. For two active checkpoints, retain both bounded alternatives and ask which to continue next time; no blocking gameplay modal mid-tick. Deletions/reset need a tombstone or generation/epoch so an offline device cannot resurrect old progress. Reset applies only to this game/account after explicit confirmation.

Outbox: bounded payloads, retry with exponential backoff/jitter, idempotency IDs, cancellation on logout, separate auth-expired and network errors. Sync summary/status only; do not upload proprietary imported level data, passwords, hints or asset binaries. Imported original packs remain local unless approved separately. Cloud progress can contain a content fingerprint without sharing the copyrighted content itself.

## Privacy and offline
Import uses user-selected files or an explicitly scoped source directory, not arbitrary drive scanning. Pack ZIP extraction rejects traversal/absolute paths/symlinks, excessive sizes and unknown executable content. Text is rendered as text, never HTML. Local progress export/import validates schema and bounds and contains no auth token. Downloads include a transparent notice about local storage and device/account visibility. Never log JWTs, chat messages, contact info, private imported maps or unrelated credentials.

Offline mode exists only for fully cached selected packs; show exact cache availability/size and removable game-only data. Missing engine/assets may prevent first-ever offline launch and must be stated truthfully. Offline guest progress is not silently assigned to a newly signed-in account; provide an explicit one-time import/merge decision in the game UI.

## Required tests
Ownership A/B/anonymous isolation; forged user ID; wrong account cache; stale revision; duplicate completion; two-device concurrent progress; outbox retry; session expiry; cloud delete versus stale offline writes; denied/quota-exhausted IndexedDB; crash during transaction; migration upgrade; content hash mismatch; corrupted snapshot; reset confirmation; no unrelated cache deletion. Test through the normal authenticated API/RLS path, not only with an administrator connection.
