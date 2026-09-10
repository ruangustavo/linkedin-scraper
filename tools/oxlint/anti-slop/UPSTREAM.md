# Anti-slop provenance

Source: bundled assets from the local `install-anti-slop` skill.

Source repository and revision: unknown. The skill bundle is not stored in a Git repository, so an immutable source revision could not be established without guessing.

Installed entry points:

- `tools/oxlint/anti-slop/index.ts`
- `tools/oxlint/anti-slop/effect/index.ts`

Intentional deviations: `shared/dictionary-types.ts` falls back to `null` after reading a statically non-empty array so it typechecks with this project's `noUncheckedIndexedAccess` setting. This does not change runtime behavior. The nested `vendor/eslint-stylistic/UPSTREAM.md` records the separate provenance and adaptations of the readability rule dependency.
