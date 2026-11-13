# AccurateHR Mobile

The AccurateHR Field view as a native Android and iPhone app (React Native with Expo, TypeScript). It is a second client of the AccurateHR Worker (`https://github.com/adamapv/AccurateHR`, served at `app.accuratehr.co`): it has no server of its own and no database. The web Field view stays; this app is built to do what it does, screen by screen.

Decisions already taken (13 Nov 2026): a full native app, not a web page in a wrapper; anyone can sign in and gets the Field view, with each part shown or hidden by their access level; every screen is native before the first store release; the office app stays in the browser.

## Never break these

1. **One set of rules, never two.** A rule the web app has (how a job card lays out, what holds Start, which days can be submitted, what an access level allows) is never written again here. It lives in a logic-only module in AccurateHR's `public/` and is copied into `shared/` by `npm run sync:shared`. **Never edit anything in `shared/` or `src/theme/tokens.ts`**: change it in AccurateHR, then sync. `npm run check:shared` fails on a hand edit. If a screen needs a rule that still sits inside AccurateHR's `public/app.js`, move it into a module there first.
2. **The server is the authority.** Tenancy, access levels and validation are the Worker's. The app hides what a level does not allow (`can` from `shared/access.js`) and shows the Worker's own words when it refuses something; it never decides on its own that something is allowed.
3. **Only fields in the contract.** The app reads only routes and fields listed in AccurateHR's `scripts/test-mobile-contract.mjs`. A screen that needs a new one adds it there first, in the same piece of work, so a later change to the Worker cannot break phones in people's pockets.
4. **What is kept on the phone belongs to one session.** The session id, company code and last email go in the secure store (`src/lib/session.tsx`), never plain storage. Anything else kept on the phone (the outbox, offline copies) is tagged with the session fingerprint and wiped on sign-out, on a new sign-in and on "Not your company?", as `clearOfflineData()` does in the web app.
4a. **Start is never offered around the safety checks.** A job is started only through `startGate` and `startButton` from `shared/job-checks.js`, as Home does. A new way to clock on to a scheduled job uses them too.
5. **Nobody is told who a company is before signing in.** With a company code the sign-in screen shows no company name or logo.
6. **The app talks to one address, fixed at build time** (`app.config.js`: production or staging). No screen lets a person type a server address.
7. **No customer-specific words** in the app's wording (a regulator's name, a city, a customer's name): the company's own details come from `me.company`.
8. **Expo changes every release.** Before using an Expo or React Native API, read the installed package's own types under `node_modules` (or the versioned docs for the SDK in `package.json`); do not rely on memory. Add a native package at the version in `node_modules/expo/bundledNativeModules.json`.

## Layout

- `src/app/`: the screens (Expo Router: one file per screen, `_layout.tsx` is the navigator). `(tabs)/` holds the tab bar's screens, and its `_layout.tsx` is the one place that sends someone who is not signed in to `sign-in`; `job-card.tsx`, `sign-in.tsx` and `change-pin.tsx` open over the tabs.
- `src/lib/`: `api-core.ts` (how the app talks to the Worker) and `offline-core.ts` (the outbox and the copies kept for reading with no signal), both with no React Native in them, so Node tests them; `offline.ts` (the phone's store, signal and session fingerprint behind `offline-core.ts`); `session.tsx` (who is signed in, and when what is waiting is sent); `use-read.ts` and `use-outbox.ts` (what a screen reads and what is waiting); `config.ts`, `dates.ts`. A write a person can make with no signal goes through `offline.submit`, never straight to `api`.
- `src/ui.tsx`, `src/pickers.tsx`, `src/theme/`: the building blocks, the date, time and searchable-list boxes, and the colours. The colours are the web app's. A date or time is always a `WhenField` and a long list a `ChooseField`. `src/rich.tsx` draws AccurateHR's rich text as native text: it cleans with the shared `sanitizeRich` first and reads it with `src/lib/rich-parse.ts`; never show stored HTML any other way, and never in a web view. `src/safety.tsx` and `src/job-row.tsx` are a scheduled job and its safety checks.
- `shared/`: copied logic. `scripts/shared-list.mjs` is the list.

## Commands

- `npm run check`: the shared-file check, the type check, and the Node tests (`scripts/test-shared.mjs`, `scripts/test-api.mjs`, `scripts/test-offline.mjs`, `scripts/test-rich.mjs`). Run it before committing. GitHub runs it on every pull request.
- `npm run sync:shared -- <path to AccurateHR>`: copy the shared logic and colours from a clean AccurateHR checkout and record its commit.
- `npm run check:shared -- <path to AccurateHR>`: also says which shared files have moved on in AccurateHR since the copy.
- `npx expo export --platform android`: bundles the app; a quick proof that everything imports.
- Android file to install on a phone: the "Android build" workflow on GitHub (Actions tab).

## Words

A *tenant* is a customer account, found by its company code. A *company* is a simPRO company inside one tenant. Never use one for the other.
