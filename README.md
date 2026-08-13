# Cash Patrol

A mobile-first **paycheck coach** for people paying down debt.

You type your balances. Those numbers are the source of truth. Cash Patrol tells you what to do with the next deposit — bills, card minimums, a cash float, then one focus debt — without pretending to be your bank.

**Live idea:** survive until the next cheque, stay current on mins, attack one balance at a time.

This started as a private tool. The product philosophy below is written so it can grow for other people without losing that soul.

---

## Philosophy

### Balances as truth
Cash Patrol is a **sim / advisor**, not a ledger.

- No bank sync (yet — maybe never as the core loop)
- No transaction matching
- No auto-moving money or rewriting debt after you “pay”

When reality changes, you **overwrite** the balance. That honesty is the feature. Apps that guess your life get ignored; apps that trust what you typed stay useful under stress.

### One job per payday
Each pay window answers one question:

> Pay landed. What do I do, in order, without lying to myself?

Default order:

1. Bills due in this window  
2. Every card/loan **minimum** (survive)  
3. Cash **float** (live until next cheque; may shrink if money is tight)  
4. **One focus** debt — all leftover goes here  

Spreading leftovers across five cards feels busy and pays none of them off. One focus clears faster and keeps the plan readable.

### Pay rhythm over calendar chaos
Paycheques are modeled as the **15th** and **month-end**. If either falls on a weekend, pay moves to the **Friday before**.

Looking ahead shows what each upcoming cheque can do after bills, mins, and float. Custom amounts cover bonuses or one-offs without changing your default income.

### Stay on track without shame
Home shows **days to payday** and a rough **$/day cash pace** so the gap between deposits is visible early.

Paycheck shows a **payoff runway** for the current focus account (mins + focus from the plan; interest not modeled). Trend charts debt/cash from **daily midnight snapshots** (owner timezone) plus overwrite history — a rear-view mirror, not the whole coach.

### Who it’s for
People who:

- Are paid on a predictable rhythm  
- Carry revolving debt and will attack **one** focus at a time  
- Will open the app and type balances  
- Want a paycheck plan, not a full budget spreadsheet  

Not for: set-and-forget bank sync addicts, or anyone who needs every coffee categorized.

### Monetization stance
The first users are people under money stress. Extractive pricing and ad-funded anxiety are out of scope. Free / tip / optional support later beats charging rent on a debt tool on day one.

---

## What you get today

| Screen | Role |
| --- | --- |
| **Balances** | Notepad of cash, cards, loans, watch-only assets. Tap a balance to overwrite it. Cash-gap strip + compact cash-seed nudge. |
| **Paycheck** | Full plan for this cheque, cash-seed details, payoff runway, upcoming pay amounts, looking ahead. |
| **Trend** | Daily midnight snapshots of each account, plus live today. Debt vs cash and per-account payoff lines. |
| **Setup** | Income, float, bills (optional auto-withdraw cash source), APRs/mins, paydown strategy (manual / avalanche / snowball). |

**Install:** production is a PWA (Add to Home Screen / Install).

**Access today:** single-owner. Registration is locked to `OWNER_EMAIL` via Convex Auth password.

---

## Stack

- React, TypeScript, Vite, PWA  
- Convex (data + Convex Auth)  
- Render static hosting  

---

## Local setup

Requirements: Node.js 22+ and a Convex account.

```bash
npm install
npx convex dev
```

In a second terminal:

```bash
npm run dev
```

`npx convex dev` writes `VITE_CONVEX_URL` to `.env.local`. Allow one owner email:

```bash
npx convex env set OWNER_EMAIL you@example.com
```

Initialize Convex Auth signing keys once per deployment:

```bash
npx @convex-dev/auth --skip-git-check
```

First visit: **Create the owner account**. Only `OWNER_EMAIL` can register. Passwords need 12+ characters with upper, lower, and a number.

> Convex Auth is beta. This private build does not send password-reset email — use a password manager.

### Checks

```bash
npm test
npm run lint
npm run build
```

### Production Convex

```bash
npx convex login
npx convex deploy
npx convex env set --prod OWNER_EMAIL you@example.com
npx @convex-dev/auth --prod --skip-git-check
```

Copy the production client URL. Keep `OWNER_EMAIL`, `JWT_PRIVATE_KEY`, and `JWKS` in Convex only — never on Render.

### Render

`render.yaml` defines a static site:

- Build: `npm ci && npm run build`  
- Publish: `dist`  
- SPA rewrite: `/*` → `/index.html`  
- Public env: `VITE_CONVEX_URL`  

---

## Opening it up: auth options (scoped, not built yet)

Today: **Convex Auth + Password + `OWNER_EMAIL` gate**. Multi-user means removing that gate and deciding how strangers sign in. Data is already keyed by `ownerId` / user id in Convex — the model is mostly ready for many users once signup is open.

### Recommendation (free path)

**Stay on Convex Auth** for v1 multi-user.

| Why | Detail |
| --- | --- |
| Already wired | `@convex-dev/auth`, password flow, React providers |
| $0 at small scale | Lives inside your Convex project; no second vendor bill |
| Fits the stack | Same deployment, same user ids in tables |
| Good enough UX | Email + password; optional magic link / OAuth later if Convex supports what you need |

**What you’d change (when ready):**

1. Drop or relax the `OWNER_EMAIL` check in `convex/auth.ts`  
2. Keep strong password rules  
3. Add password reset (email) before inviting strangers — critical for “poor people who forget passwords”  
4. Rate-limit / abuse basics (Convex + email provider)  
5. Soft onboarding: seed empty accounts or a guided Setup, not someone else’s notepad names  

**Free email for resets:** Resend free tier, or Convex/docs-recommended provider when you add it — budget a little ops time, not a big auth rewrite.

### Clerk (seen it — solid, not free forever)

- Excellent UI, social login, user management dashboard  
- Free tier is generous for early users, then paid  
- Convex has a first-class Clerk integration path  
- **Use if:** you want Google/Apple sign-in and hosted user admin without building it  
- **Skip for now if:** you want $0 and already have Convex Auth working  

### Auth0 (“Auth me”)

- Enterprise-grade; free tier exists but is easy to outgrow / overconfigure  
- Heavier than this app needs  
- **Use if:** you already live in Auth0 or need enterprise SSO later  
- **Skip for a paycheck PWA** aimed at stressed individuals  

### Other free-ish notes

| Option | Verdict |
| --- | --- |
| **Magic link only** (Convex Auth or Clerk) | Great UX, needs reliable email delivery |
| **Google OAuth** | High conversion; add when you’re ready for provider setup + privacy copy |
| **Anonymous / device-only** | Risky for debt data (lost phone = lost plan); not recommended as sole auth |
| **Passkeys** | Nice later; not the first unlock |

### Suggested sequence (still not implemented)

1. **Private beta:** keep `OWNER_EMAIL` or a short allowlist  
2. **Open Convex Auth passwords** + reset email + terms/privacy one-pager  
3. **Optional Google** once a handful of real users ask for it  
4. Revisit Clerk only if user-management or social login becomes the bottleneck  

---

## Product principles for a wider audience

1. Never auto-change balances the user didn’t type.  
2. Prefer one clear plan over many dashboards.  
3. Mins before hero payments.  
4. Strategy is explicit (manual / avalanche / snowball) — don’t silently fake identical APRs.  
5. Charge money only if it clearly saves people money — and make it optional for as long as you can.

---

## License / status

Personal project; currently owner-locked. Philosophy and roadmap above are invitation notes for a future multi-user release — auth expansion is **documented, not shipped**.
