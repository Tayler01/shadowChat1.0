# Will & Kirk releases

The room shows one column of chapter cover/player frames, newest first. The
header stays 64px plus the existing safe area. Scheduled chapters show their
cover with a lock, Eastern release date, and a live seconds countdown inside
the frame. They have no play button or mounted player. The room refreshes on
focus and visibility return, every minute, and every five seconds for the first
ten minutes after a pending unlock. Countdown ticks pause while hidden.

Uploading and publishing are separate operator actions. An upload stays draft
until deliberately published as a locked preview or released chapter. No admin
uploader was added. The Play picker badge uses only ready, published, released
videos with playback and a release timestamp at or before the current time.
Its 24-hour window starts at that timestamp; upload and preview creation do
not start it. The badge is a sharp SVG plaque in the series gold/navy/red style.

## Chapter Two: The Great Escape

The approved source is `the-great-escape-chapter-two-review-v2.mp4` from the
WILL Audio book project: 19:48, 1080p. Release is Friday, November 6, 2026,
7:30 p.m. America/New_York, or November 7 at 00:30 UTC after the DST change.

Before unlock, the public catalog row has no episode provider ID, provider
payload, embed, or external playback URL. Its poster is a separate static WebP.
The existing private Bunny provenance registry owns the encoded upload. The
existing media signer therefore has no visible episode reference to authorize.

Database Cron job `will-kirk-unlock-aa688a60` checks the absolute deadline once
per minute. It publishes the exact chapter's playback metadata only after that
deadline, if the row is still published/locked, the release date is unchanged,
the owner remains active, and trusted upload provenance matches. On success it
unschedules itself. Hiding/deleting the chapter cancels publication. Removing
the job cancels the release. No schema, RLS, Edge Function or provider security
settings changed; the broad backend rollout hold remains in place.

For each future Friday, resolve 7:30 p.m. with America/New_York (DST applies),
upload/register the exact approved bytes, explicitly stage the locked preview,
and create a guarded, self-removing publication job. Keep unreleased playback
metadata out of member-readable rows until the scheduled unlock.

## Verification

Catalog/badge/countdown unit tests cover hidden/draft/processing content,
newest-first order, locked preview visibility, no premature playback or badge,
the exact unlock boundary and exact 24-hour expiry. Android/Chromium,
iPhone/WebKit and desktop fixture checks exercise countdown ticking, no locked
player, layout, scroll, playback of unlocked chapters and badge placement.
The publication SQL was tested before the deadline and at a simulated deadline
inside a transaction that was rolled back. Members cannot read Cron's schema.
Physical installed-PWA and the actual future timed run remain unverified.
