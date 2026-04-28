# Chat Link Previews

ShadowChat renders `http://`, `https://`, and `www.` URLs in group chat and DMs as clickable links. The first URL in a text message can also load a compact preview card.

## Architecture

- [src/lib/linkPreview.ts](C:/repos/chat2.0/src/lib/linkPreview.ts:1) tokenizes message text, normalizes safe URLs, de-duplicates in-flight preview requests, and caches successful previews in memory plus `localStorage`.
- [src/components/chat/MessageRichText.tsx](C:/repos/chat2.0/src/components/chat/MessageRichText.tsx:1) renders safe React text/link nodes and the preview card.
- [supabase/functions/link-preview/index.ts](C:/repos/chat2.0/supabase/functions/link-preview/index.ts:1) fetches Open Graph/Twitter metadata server-side so the browser does not depend on third-party CORS behavior.

## Security And Reliability

- The Edge Function requires a signed-in Supabase bearer token even though gateway JWT verification is disabled for deployment compatibility.
- Only `http` and `https` URLs are accepted.
- Localhost, `.local`, loopback, link-local, and private IPv4 targets are rejected before fetch. Redirect destinations are checked too.
- Remote fetches use short timeouts and read at most 512 KB of HTML.
- X/Twitter links try `publish.twitter.com/oembed` first, then fall back to Open Graph parsing.

## Deployment

Deploy the function before deploying the frontend that calls it:

```powershell
supabase functions deploy link-preview --no-verify-jwt
npm run build
npx netlify deploy --prod
```

## Validation

Run:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npx jest --runInBand --runTestsByPath tests/linkPreview.test.ts tests/MessageItem.test.tsx
npm run build
```

Then use Playwright or a headed browser against `vite preview` to send:

```text
https://x.com/OpenAI
https://example.com
```

The link text should be clickable immediately, and a single preview card should appear after metadata resolves.
