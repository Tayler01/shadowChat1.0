# Security migration phase fixtures

`pre-split-manifest.json` records the exact 18 reviewed migration hashes before
phase extraction. The four files changed by the split are preserved under
`pre-split/`; the other 14 must still match their recorded hashes. This is test
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

The foundation phase retains the existing profile grants, permits the legacy
unregistered Creator write without treating it as trusted media, leaves capture
triggers inactive, and leaves existing Realtime policies effective. Activation
enables the original final rules. Both phases keep the three member-media
buckets public in this fixture: changing provider/bucket settings is a separate
coordinated release operation.

Run `node --test tests/securityMigrationPhases.node.test.mjs` from the repository
root. No network access, accounts, real media, files outside this fixture, or
external provider state are used or changed by this suite.
