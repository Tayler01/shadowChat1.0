# ShadowChat Streamlined

A separate web edition for reviewing the eventual iPhone and Android store app.
The full app remains available and keeps its existing build and deployment.
Both editions use the same approved accounts, server, conversations and ShadowPin
content. Changes made while signed in affect that shared content.

## Run locally

Use the repository's Node 24 environment and existing `.env` configuration:

```powershell
npm run dev:streamlined
npm run build:streamlined
npm run preview:streamlined
```

Development and preview listen on `http://127.0.0.1:4175`. Run one at a time.
The independent output is `apps/streamlined/dist`; `npm run build` still builds
the full app into its usual output. No new repository or production dependency
is required by the edition itself.

For feature review before the membership-acknowledgement backend is available:

```powershell
npm run build:streamlined:local-preview
npm run preview:streamlined:local-preview
```

This explicitly separate artifact lives in `apps/streamlined/dist-local-preview`
and identifies itself in the browser title and build metadata. It opens the
features for an already signed-in approved account on exact loopback hosts only
(`127.0.0.1`, `localhost`, or `[::1]`) and never in a native app shell. It does not
read or save age/terms acceptance. Existing authentication and content RLS still
apply; chat actions still affect the shared server. Never publish this artifact.
The regular build remains in `dist`, still requires the server acknowledgement,
and its verifier rejects the enabled local-preview runtime.

## Product boundary

- Four primary destinations: Group chat, Direct messages, ShadowPin and Settings.
- Reuse the existing chat and DM components, media and voice handling, replies,
  reactions, search, saved content, presence, and Pinterest-style radial photo
  controls. Preserve the existing mobile viewport, keyboard and safe-area logic.
- Keep account/profile, notification, privacy/blocking, accessibility/Comfort,
  safety reports, sign-out and account deletion settings.
- Omit games, weather, other activity destinations, elaborate theme choices,
  Easter eggs and the full app's surrounding navigation. Existing source and
  backend data remain available to the full app.
- Enable existing member reporting only for this edition. Full-app defaults
  remain unchanged. Operators continue to use the full Safety Case Center.
- Public preview policy routes: `/?legal=privacy`, `/?legal=terms`,
  `/?legal=safety`, `/?legal=delete-account`.
- An 18+ declaration and terms/privacy acknowledgement precede content access.
  The server stores an immutable, account-bound policy receipt; an unavailable
  acknowledgement endpoint blocks content access while leaving account/deletion
  help available. Self-declaration does not verify a person's age. Auth, server
  membership checks and RLS remain responsible for protected content.
- `/?view=settings&settingsSection=account` remains available after login even
  when a member declines the preview terms or age gate. Deleting the account
  affects every edition of ShadowChat, not just this preview.

The Vite config substitutes only navigation, header, room tools, theme and brand
modules. It does not fork the chat implementation. A build verifier inspects
the source graph, retained feature modules, emitted assets and initial payload;
it fails if excluded applications or theme/game assets enter this edition.

The edition uses a transparent round mark for sign-in and compact headers. Its
generated master and provenance are in `design/`; only the optimized 12 kB WebP
is imported by the app. The full edition keeps its existing artwork. Public
policy and deletion links are also reachable from the signed-out screen.

## Contact configuration

Public configuration may be supplied through `VITE_SUPPORT_EMAIL`,
`VITE_PRIVACY_EMAIL` and `VITE_OPERATOR_NAME`. Optional
`VITE_PRIVACY_POLICY_URL` and `VITE_TERMS_URL` override the settings links.
Never place credentials or service-role secrets in `VITE_*` variables.

The user-confirmed public service operator defaults to **Caleb Y Polder**.
`VITE_OPERATOR_NAME` can override this when the actual service operator changes.
This confirmed identity does not remove the remaining policy release checks.

The verified default addresses are `support@shadochat.online` and
`privacy@shadochat.online`. Zoho Mail Free hosts one mailbox; privacy is an alias
that receives into the same inbox and can send replies from its own address.
Domain ownership, MX, SPF and DKIM were verified on October 22, 2026. Separate
inbound tests and replies from both addresses reached the owner's Gmail inbox
with SPF and DMARC passing. Use the existing Google sign-in at
[Zoho Mail](https://mail.zoho.com/) to manage this mailbox. No paid plan was bought.
The final post-activation message reached Gmail with SPF, DKIM and DMARC all
passing; the sanitized receipt is `output/email-setup/verification.json`.
If overriding either address, verify its delivery before publishing it.
Store approval and reliable support take priority over choosing a free provider.
The preview policy pages remain clearly labeled drafts until the actual data,
retention, deletion and moderation practices are verified.

## Verification and release boundary

The edition builds on shared code, so verify both builds:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
npm run build:streamlined
npm run docs:verify
```

Use `node scripts/streamlined-browser-smoke.mjs --read-only` for the initial
browser pass. The default smoke also creates exact-tagged group and DM test
messages with the repository's two configured QA accounts and removes only its
own content. Review its report and cleanup evidence under `output/playwright`.
Do not expose credentials, persist browser auth state or run broad cleanup.

This local edition has not been deployed or submitted to either store. Native
builds remain a later phase after web feature acceptance. Browser emulation is
not proof of physical-device push, keyboard, capture, background media or store
acceptance. Server privacy changes, policy publication, operational moderation,
complete deletion coverage, signed native artifacts and reviewer access remain
separate gates in [store readiness](../../docs/STREAMLINED_STORE_READINESS.md)
and [the security audit](../../docs/STREAMLINED_SECURITY_AUDIT.md).

The private-media client is staged behind an environment gate and must not be
enabled independently of the coordinated backend/client rollout. Existing
public buckets have not been converted. Forwarded-media provenance, cached link
previews and OS notification images require explicit compatibility tests before
the cutover. Applying a migration locally is not proof of live protection.
