# Schema scope
These JSON Schema 2020-12 contracts are versioned starting points. Raw DAT output is produced by the supplied parser. Normalized levels, replays and save/phase envelopes are implementation contracts, not generated campaign/runtime data.

JSON Schema cannot prove level solvability, actor ordering, secret visibility, source ownership, legal movement or replay truth. Add semantic validators. The normalized `terrain`/`contents` strings must be restricted to the finalized registry during P02. The save `state` must be replaced/refined by a strict CoreState schema before accepting runtime imports. Do not claim these initial envelopes fully validate an unimplemented engine. Enforce input-byte/nesting/record limits before JSON parsing and schema validation, not afterward.
