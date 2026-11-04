# copy-min-stock-new-branch

## Objective
When creating a branch (local), let the admin copy the per-product minimum stock from an existing branch, so the new local does not fall back to the generic `minStock`.

## Constraints
- Contract first (CLAUDE.md): `docs/API.md` -> `types.ts` -> `contract.ts`/`http.ts` -> mock -> pure rule with tests -> screen -> README.
- `Product.minStockByBranch` already exists (`Partial<Record<BranchId, number>>`); a branch not listed falls back to `minStock`. Data shape does not change, so no mock `VERSION` bump.
- Optional and backward compatible: `BranchCreateInput.copyMinStockFrom?: BranchId`. Without it, behavior is unchanged.
- No new dependencies. UI text in Peruvian Spanish. No personal data in audit.
- Stock itself is never copied or edited (kardex rules): only the minimums.
- No Co-Authored-By. Conventional commits. No push or merge without the user.
- Checks: `npm run typecheck`, `npm test`. TDD: not configured; pure helper gets Vitest tests. Runner: Vitest.

## Tasks
- [ ] M1 Pure rule `copyMinStock` in `src/lib/domain/` + tests.
- [ ] M2 Contract + mock + audit: `copyMinStockFrom` in `BranchCreateInput`, API.md, mock `createBranch` validates the source branch exists (`fail(code, message, status)`), applies the rule, audit rule records only the source branch id.
- [ ] M3 Screen: "Nuevo local" dialog gets a select "Copiar los stock mínimos de" (active branches + "No copiar"), default = first active branch.

## Route per task
Delegated writer (4+ files); parent verifies with typecheck, tests and browser, commits per phase.

## Progress / evidence

## Next step
Delegate writer.
