# Cash on hand account flag

## Problem
Every account with `kind === "cash"` is summed into Cash on hand. Reserved checking accounts (e.g. car-payment source) inflate that total.

## Solution
Add optional `includeInCashOnHand` on accounts (same pattern as `includeInPaydown`).

- Cash accounts: missing/undefined treated as **true** (existing data stays correct).
- Non-cash: ignored / forced false on save.
- Seed cash accounts: `true`.

## Behavior
Cash on hand totals (Balances, Paycheck, cash gap, trend cash, snapshot exports) only sum Cash accounts with the flag on.

Cash accounts with the flag off still appear as Cash for listing, bill auto-withdraw linking, and cash-seed alerts.

## UI
Setup account form: when Type is Cash, checkbox “Count toward cash on hand” (default checked).
