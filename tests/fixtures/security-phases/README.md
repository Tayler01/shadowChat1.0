# Security migration phase fixtures

`pre-split-manifest.json` records the exact 18 reviewed migration hashes before
phase extraction. Files changed by extraction or the later CLI parser repair
are preserved under `pre-split/`; other files must still match their recorded hashes. This is test
input, never an alternative deployment migration directory.

The Node test executes the full original sequence and the foundation followed by
activation in separate in-memory PGlite databases. It compares actual PostgreSQL
function definitions and privileges, table/column privileges, RLS policies,
triggers, constraints, indexes, comments, and role settings. It also checks the
existing safe profile projection and real historical Creator Studio finalizers
before and after activation. The unrelated tag association function and report
intake side effects are bounded fixture stubs; their signatures are preserved.
The existing reporting and provider harnesses test those separate boundaries.
The independently added legacy deletion adapter, retention removal claims, and
service-only legacy reconciliation are applied identically to both databases.
They are included in parity without treating their new behavior as part of the
original 18-file snapshot. The current sequence contains 20 foundation migrations
followed by `20261023224455_security_privacy_activation.sql`; the test rejects
uncovered staged migrations or activation ordered before a companion.

The typing and report-visibility invoker helpers use SQL-standard RETURN
expressions because the pinned CLI splits BEGIN ATOMIC bodies at CASE's END.
Their immutable original bodies remain in the historical fixtures. The current
equivalent spelling is applied to both final catalogs for parity; dependency
binding remains at definition time, with no extra private-schema grants.
The same independent lint fixes apply to both final catalogs: remove the
redundant integer FOR-loop variable declaration and mark the URL decoder STABLE
because PostgreSQL's UTF-8 conversion functions are STABLE.

The fixtures retain the actual legacy authenticated USAGE grant on `private`.
The two privileged typing/report implementations instead live in
`member_mutation_private`, whose USAGE is denied to client roles. The original
catalog receives this independently reviewed namespace move before parity.
Bound invoker wrappers still call the exact implementations, while direct role
calls cannot supply forged authorization. Existing full-app Catch-Up, discovery,
and comment-reaction RPCs keep their `private.users_have_block` access.

The foundation phase retains the existing profile grants, permits the legacy
unregistered Creator write without treating it as trusted media, leaves capture
triggers inactive, and leaves existing Realtime policies effective. Activation
enables the original final rules. Both phases keep the three member-media
buckets public in this fixture: changing provider/bucket settings is a separate
coordinated release operation.

Run `node --test tests/securityMigrationPhases.node.test.mjs` from the repository
root. No network access, accounts, real media, files outside this fixture, or
external provider state are used or changed by this suite.
