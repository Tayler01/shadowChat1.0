# Chat Link Previews

## Documentation Status - June 8, 2026

Updated after the June 8, 2026 shared safe-fetch and Instagram preview hardening. The linked Supabase project showed `link-preview` active with a June 8 deployment timestamp during the evening doc-freshness pass.

ShadowChat renders `http://`, `https://`, and `www.` URLs in group chat, DMs, and board chats as clickable links. The first URL in a text message can also load a compact preview card.

## Architecture

- [src/lib/linkPreview.ts](C:/repos/chat2.0/src/lib/linkPreview.ts:1) tokenizes message text, normalizes safe URLs, de-duplicates in-flight preview requests, and caches successful previews in memory plus `localStorage`.
- [src/components/chat/MessageRichText.tsx](C:/repos/chat2.0/src/components/chat/MessageRichText.tsx:1) renders safe React text/link nodes and the preview card.
- [supabase/functions/link-preview/index.ts](C:/repos/chat2.0/supabase/functions/link-preview/index.ts:1) fetches Open Graph/Twitter metadata server-side so the browser does not depend on third-party CORS behavior. It preserves image thumbnails and marks video/player links so the card can show a video thumbnail badge.

## Security And Reliability

- The Edge Function requires a signed-in Supabase bearer token even though gateway JWT verification is disabled for deployment compatibility.
- Only `http` and `https` URLs are accepted.
- Localhost, `.local`, loopback, link-local, and private IPv4 targets are rejected before fetch. Redirect destinations are checked too.
- Remote fetches go through the shared Supabase safe-fetch helper, which
  resolves A and AAAA records, blocks local/private/reserved IPv4 and IPv6
  targets, blocks IPv4-mapped IPv6 private targets, follows redirects manually,
  validates each redirect target before fetch, and fails closed when the host
  cannot be verified as public.
- Remote fetches use short timeouts and read at most 512 KB of HTML.
- X/Twitter links merge `publish.twitter.com`/`publish.x.com` oEmbed text with image metadata. X often omits `og:image` from normal logged-out fetches even though iMessage-style preview crawlers receive a card image, so the function also extracts first-party `pbs.twimg.com/media/...` assets from public X post HTML and normalizes them to a large thumbnail.
- If X removes those public media hints, the official fallback is X API v2 post lookup with `expansions=attachments.media_keys` and `media.fields=url,preview_image_url,type`, which requires a bearer token and should be added as a server-side secret before relying on it in production.
- YouTube and Vimeo links also use provider oEmbed fallbacks so video thumbnails still appear when the page HTML does not expose usable Open Graph metadata to the function.
- Facebook/Instagram/Meta oEmbed support can use `META_OEMBED_ACCESS_TOKEN`, or `META_APP_ID` plus `META_APP_SECRET`, as Supabase Edge Function secrets. Do not expose these values through frontend `VITE_*` env vars.
- Instagram preview image URLs from `cdninstagram.com` and related Meta CDN
  hosts are unstable on iOS Safari and can expire or return device-specific
  failures. When `SUPABASE_SERVICE_ROLE_KEY` is available, `link-preview`
  copies those preview images into the public `message-media` bucket and returns
  the Shado-hosted URL to chat clients. If the copy fails, clients still keep
  the text card and render a nonblank image fallback instead of a broken frame.

## Deployment

Deploy the function before deploying the frontend that calls it:

```powershell
supabase functions deploy link-preview --no-verify-jwt
npm run build
git push origin main
```

The push to `main` starts the GitHub Actions Netlify production deploy. Use
`npx netlify deploy --prod` only as a manual fallback.

After deploy, confirm the remote function timestamp with:

```powershell
supabase functions list
```

## Validation

Run:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npx jest --runInBand --runTestsByPath tests/linkPreview.test.ts tests/MessageItem.test.tsx
npx jest --runInBand tests/MessageRichText.test.tsx tests/safeFetchIntegrationContract.test.ts
npx jest --runInBand tests/safeFetch.test.ts
npm run build
```

Then use Playwright or a headed browser against `vite preview` to send:

```text
https://x.com/OpenAI
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://example.com
```

The link text should be clickable immediately, and a single preview card should appear after metadata resolves. Links with Open Graph/Twitter image metadata should show the image; video/player links should show the thumbnail with a compact `Video` badge.
