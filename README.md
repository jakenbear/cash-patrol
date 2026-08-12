# Cash Patrol

A private, mobile-first cash-flow and debt paydown advisor. You overwrite
account balances when they change — that number is the source of truth. The app
suggests what to do with each paycheque while keeping a small cash float.

Paycheques are treated as the **15th** and **month-end**. If either date falls on a
weekend, pay moves to the **Friday before**.

This is a **sim / advisor**, not a bank ledger. No transaction matching, no
auto-updating debt after you pay.

## Install on a phone

The production site is a Progressive Web App (PWA).

- **Android / Chrome:** open the site, sign in, and tap **Install** in the
  header (or use **Add to Home screen**).
- **iPhone / Safari:** open the site, tap **Share**, then **Add to Home Screen**.

## Stack

- React, TypeScript, and Vite
- Convex database and Convex Auth
- Render static-site hosting

## Local setup

Requirements: Node.js 22 or newer and a Convex account (a local anonymous
deployment also works).

```bash
npm install
npx convex dev
```

In a second terminal:

```bash
npm run dev
```

`npx convex dev` writes `VITE_CONVEX_URL` to `.env.local`. Configure the one
email allowed to register:

```bash
npx convex env set OWNER_EMAIL you@example.com
```

Initialize Convex Auth signing keys once per deployment:

```bash
npx @convex-dev/auth --skip-git-check
```

On first visit, choose **Create the owner account**. Registration is rejected
for every email except `OWNER_EMAIL`. Passwords require at least 12 characters
with uppercase, lowercase, and a number.

> Convex Auth is currently beta. This lightweight private version does not send
> password-reset email. Store the password in a password manager.

## How it works

1. **Balances** — notepad of accounts. Tap a number to overwrite it.
2. **This paycheck** — income minus bills due in the window, reserve float, cover
   minimums, dump leftover on the focus debt (priority #1).
3. **Trend** — debt/cash chart from balance overwrites.
4. **Setup** — paycheque amount, float, bills, APRs/mins, priority order.

First sign-in seeds accounts from a starter notepad (Moola, Cap one, CC Card,
etc.). Edit balances and setup to match your reality.

## Checks

```bash
npm test
npm run lint
npm run build
```

## Production Convex

```bash
npx convex login
npx convex deploy
npx convex env set --prod OWNER_EMAIL you@example.com
npx @convex-dev/auth --prod --skip-git-check
```

Copy the production client URL printed by Convex. Do not put `OWNER_EMAIL`,
`JWT_PRIVATE_KEY`, or `JWKS` in Render; those belong only in Convex.

## Render

`render.yaml` defines a static site with:

- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- SPA rewrite: `/*` to `/index.html`
- Required public variable: `VITE_CONVEX_URL`

Push this project to a GitHub or GitLab repository, create a Render Blueprint
from that repository, and enter the production Convex client URL when Render
asks for `VITE_CONVEX_URL`.
