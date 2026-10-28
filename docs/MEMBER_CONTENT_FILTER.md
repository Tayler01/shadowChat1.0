# Prospective member text and link filtering

This layer is a bounded preventive control for the streamlined App Store release. It does not replace member reporting, blocking, operator moderation, or the other store requirements.

## Contract and scope

Migration `20261028120650_member_content_filter.sql` adds private server-owned rules and BEFORE-write triggers on General Chat and DM content, ShadowPin category/pin titles and descriptions, pin source URLs, and comment bodies. File/video JSON captions and names are decoded before matching. Changes of message type are checked because they can change how an unchanged JSON payload is rendered. Ordinary unrelated updates and unchanged historical text are not scanned. No existing content is migrated, inspected, or removed.

The trigger covers authenticated direct SQL/PostgREST writes and service-role producers, including Creator Studio publication into canonical Pin tables. A browser-only check cannot bypass it. Existing RLS remains authoritative. Rules, audit records, normalization, and trigger functions are not callable/readable by members or service-role clients; there is no new public RPC or third-party classifier.

A denied write raises SQLSTATE `PT422` with the fixed marker `CONTENT_POLICY_REJECTED`. Both chat editions show an actionable message, retain the failed local outbox item, and restore an optimistically cleared composer only if the user has not edited it or switched scope. No authentication retry, reconnect, push, or automatic Creator finalization retry follows this deterministic rejection. A manual retry can still be rejected; edit the restored draft and remove the obsolete failed item. Existing media preparation/caption retention is preserved.

Pin insert/update errors retain the form or Creator draft. Definite rejection of a newly uploaded image removes only the exact new non-upserted path; uncertain network failures never cause deletion. URL-import handlers similarly compensate new originals. Existing Bunny registry compensation handles failed unpublished provider creates. Direct-upload cleanup failure is surfaced to the user; import cleanup failures need operator follow-up from server logs. Draft media is retained for editing, not erased. Structured 422 responses propagate through existing image/video handlers.

## Initial rules and limits

Four narrow English phrases cover explicit lethal/sexual-violence threats and targeted encouragement of self-harm. These are actual enabled rules, not an empty framework. Case, compatibility-width forms, zero-width marks, and punctuation/whitespace differences are normalized. Ordinary profanity, identity words, and discussion of getting help are allowed.

Exact quoted threats also match: the filter does not infer intent. A quotation, fictional line, or educational discussion may require rephrasing or support review. Do not represent this as complete abuse detection. Paraphrases, other languages, homoglyphs, images, audio, and video semantics are not comprehensively classified.

Domain matching checks exact hosts and subdomains of explicitly denied hosts in HTTP(S), protocol-relative, and www links, including ASCII percent-escaped hosts and userinfo handling. It does not fetch destinations, follow redirects, expand short links, or implement universal IDNA/deobfuscation. The seeded `shadowchat-safety-test.invalid` domain is a non-routable acceptance canary, **not a real malicious-domain intelligence feed**. Add a real domain only after the operator has verified its harmful purpose; do not seed guessed or stale accusations.

The evaluator allows at most 256 enabled rules and 64 KiB and 128 extracted links per stored text field. It uses bounded literal phrase comparisons and a fixed URL extractor; operators cannot supply arbitrary regular expressions. Overlarge text returns PT413. Excess enabled rules fail closed with an operator configuration error.

## Operator changes

Use a reviewed privileged SQL migration to insert, disable, amend, or delete a rule in `content_filter_private.rules`. Each change is recorded in the private append-only-to-members audit table with the database session identity, old/new rule, and timestamp. Named migrations/code review provide the human change attribution when using a pooled database identity. Do not grant browser or service-role access to these tables/functions, and do not expose the private schema in PostgREST. Rollback a mistaken phrase by disabling that exact rule; do not remove the trigger or silently relax all rules.

A phrase value is normalized lowercase ASCII words separated by one space (maximum 128 characters). A domain is a lowercase ASCII hostname (maximum 253 characters). Each rule needs a documented reason. Keep the false-positive cost narrow and review user reports through the published support channel.

## Release and verification

This is an additive follow-up change, not part of the already pinned 264-migration backend release. The release owner must create/update the reviewed additive migration plan and function classifications. Preserve the current rollout evidence and do not silently alter its manifest.

Deploy the structured media-error handlers and compatible clients before enabling the new triggers, then apply the migration with controlled-stage checks. Old clients remain able to post ordinary content but may show generic errors for policy rejection. Stage verification must cover direct REST writes using real authenticated roles, both editions' retained drafts, a failed upload cleanup, and ordinary sends/replies/reactions/uploads. Use synthetic data and remove it and its media afterward. Keep rejection acceptance phrases synthetic/private; do not post them into the real community.

Local proof includes a PGlite PostgreSQL role harness applying the actual migration to five minimal tables with owner RLS, including denied inserts/edits, role isolation, benign content, domain-boundary cases, quoted-threat limitation, encoded attachment/type changes, historical-content preservation, and service-role producers. This is executable PostgreSQL proof, not proof of the full linked production schema or an actual HTTP request. Jest covers client draft races, single-attempt/no-push behavior, Creator finalization, structured Edge errors, and definite-versus-ambiguous image cleanup. Full and streamlined lint/type/build checks are recorded with the patch evidence.
