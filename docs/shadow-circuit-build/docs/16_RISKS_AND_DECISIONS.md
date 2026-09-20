# Risks, assumptions and resolved decisions

| Risk | Current state | Mitigation / honest completion boundary |
|---|---|---|
| Original 149-level MSCC files unavailable here | BLOCKED SOURCE | Authorized source import remains explicit; build independent systems using original synthetic fixtures/community data; never substitute silently |
| Original/community redistribution permissions | NOT VERIFIED FOR A SHIPPED PACK | Inspect actual archive terms; maintain allowlist; restricted sources excluded from deploy |
| CCLP1 network download | NOT RUN SUCCESSFULLY | Official source located, scripted safe fetch on XPS; no full binary bundled |
| Windows vs Lynx/Steam mechanic differences | REQUIRES CONTRACT | Per-variant fixtures and versioned profile; no assumed exact parity |
| 3D camera/elevation breaks puzzle readability | DESIGN CONSTRAINED | Elevated view, occlusion rules, no new topology or jump, tile-edge/timing invariants |
| Mobile browser GPU/memory/thermal limits | UNMEASURED | Early embedded proof, hard budgets, instancing/chunking, tiered quality, actual phones |
| New engine bloats existing app | KNOWN BUDGET CONFLICT TO HANDLE | Strict lazy isolation, narrow measured exception, eager-load regression test |
| Generated art is technically valid but ugly | NOT BUILT | Calibration/contact sheets/finished sample before mass production; actual visual review |
| One-shot agent stops at prototype | WORKFLOW RISK | P00–P11 plan, persistent ledgers and evidence; explicit full-scope continuation instruction |
| Testing validates only happy paths | WORKFLOW RISK | Interaction matrices, fuzz, injected failures, independent QA and full-level evidence |
| Snapshot changes under updates/account switches | REQUIRES TESTING | Version/content hashes, atomic saves, namespace isolation, conflict and tombstone rules |
| Paid asset/tool dependencies | AVOIDED | Blender/CLI, no Higgsfield or Unity required, no purchases authorized |
| Blueprint overpromises bug-free result | AVOIDED | State defined passed tests/known issues; physical/source gates cannot be self-certified |

## Scope boundaries
“Everything else is your call” resolves product choices, not permission to purchase, deploy production or claim third-party intellectual property rights. Full single-player game systems are required. No multiplayer, leaderboards, crypto rewards, monetization, custom public level editor, free-running platformer hub, or native app build in v1. These would distract from complete puzzle parity and mobile polish.

## When to revise a decision
Record problem/evidence/options/tradeoffs/chosen action/tests in the living DECISIONS file. Minor dimensions/colors/timing polish may change when measured UX improves and rules stay identical. Engine replacement, campaign substitution, fidelity reduction, new paid infrastructure or publishing restricted assets are not invisible “implementation details.” Do not decide an unavailable original campaign is complete by changing its name.

## Preparation limitations
The package is written from partial remote repo reads and primary documentation, not a full code audit or an inspected XPS. Included script tests run only in the preparation container. No game code, Blender export, Unity session, actual phone test, production migration, live app edit or source campaign download is asserted. See actual evidence report for exact run status.
