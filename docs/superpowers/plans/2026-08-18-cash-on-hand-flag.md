# Cash on Hand Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose which Cash accounts count toward Cash on hand totals via a per-account flag.

**Architecture:** Add optional `includeInCashOnHand` on accounts (default true when missing for cash). Totals/trend helpers filter on the flag; Setup form exposes a checkbox for Cash accounts. Non-cash forced false on save.

**Tech Stack:** Convex schema/mutations, React Setup UI, Vitest unit tests for `totalsFromAccounts` and `balanceTrend`.

**Spec:** `docs/superpowers/specs/2026-08-18-cash-on-hand-flag-design.md`

---

### Task 1: Totals helper + tests

**Files:**
- Modify: `src/lib/paycheckPlan.ts` (`PlanAccount`, `totalsFromAccounts`)
- Modify: `src/lib/paycheckPlan.test.ts`

- [ ] Add failing tests: cash with flag false excluded; missing/undefined flag still counts
- [ ] Add `includeInCashOnHand?: boolean` on `PlanAccount`; update `totalsFromAccounts`
- [ ] Run `npm test`

### Task 2: Trend cash totals + tests

**Files:**
- Modify: `src/lib/balanceTrend.ts` (`sumMode` / kinds map)
- Modify: `src/lib/balanceTrend.test.ts`
- Modify: `src/lib/api.ts` (`Account` type)

- [ ] Add failing test: reserved cash account excluded from daily cash total
- [ ] Thread flag into cash summing (only cash + flag not false)
- [ ] Run `npm test`

### Task 3: Schema + Convex upsert/seed

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/accounts.ts`

- [ ] Add optional `includeInCashOnHand` to schema
- [ ] Seed cash accounts with `true`; upsert accepts and forces false for non-cash

### Task 4: UI + wiring

**Files:**
- Modify: `src/lib/api.ts` (`upsertAccount` args)
- Modify: `src/App.tsx` (plan account mapping)
- Modify: `src/features/setup/SetupPage.tsx`

- [ ] Checkbox on Cash account edit form; pass through upsert
- [ ] Map flag into plan accounts

### Task 5: Verify + ship

- [ ] `npm test` and `npm run build`
- [ ] Commit and push (user requested push)
