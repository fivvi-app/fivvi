# ADR-011: Hosting and environments

| | |
|---|---|
| **Status** | **Proposed** (re-evaluation, awaiting the owner's decision) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Supersedes (if accepted)** | The accepted 2026-09-22 choice "Vercel Hobby (web + API) + Neon free (Postgres, Frankfurt)", `ROADMAP.md` v1.2 §4.3 |
| **Related** | PRODUCT.md §75, §79; ROADMAP.md §2 (principles 7, 9), M1, M9, §11, §12, §13 (R14); ADR-002, ADR-004, ADR-005, ADR-006, ADR-010, ADR-013; E003, E004, E012, E016 |

## Context

ADR-011 was accepted as **Vercel Hobby (web + API) + Neon free (Postgres, Frankfurt, branches for previews)**, moving to a paid plan or Cloudflare at Gate G4. Before any hosting is built (E003 in M1), two facts changed the picture:

1. The owner **already pays for Railway Hobby** and has **Vercel accounts**.
2. Checking the current terms shows that the "free until G4" plan relied on Vercel Hobby, which is **non-commercial only**. We have to pay somewhere at G4 anyway, so the question is where production should run.

What the host must provide:

- One backend for web, public booking, client web and the native apps (`PRODUCT.md §75`, ADR-002/004): a Next.js app with the Hono API in route handlers.
- PostgreSQL with RLS in the **EU** (ADR-005/006), with backups and a restore we can actually test (E016).
- **Preview environments per PR**, because agents work in parallel worktrees (`WORKFLOW.md`).
- A **daily cron** for hold cleanup, recurrence materialization and retention (ADR-010).
- **EU data residency** for client data that may include health information (`PRODUCT.md §79`, `ROADMAP.md §4.4`).
- €0 or close to it during the build; a small, predictable cost at pilot volume (one gym, a handful of trainers, a few hundred clients).

### Research (terms and prices checked 22 September 2026)

*Prices in USD, excluding VAT. Free-tier terms change often; re-check at M9 (`ROADMAP.md §12`).*

**Vercel**

- Hobby is free, but "restricted to non-commercial personal use only". Commercial use is defined as a deployment used for the financial gain of **anyone involved in any part of the production**, "including a paid employee or consultant writing the code". Commercial use requires Pro or Enterprise. [Fair use guidelines]
- Pro: **$20/month per developer seat**. Usage beyond the included credit is billed ($0.60 per 1M invocations, Active CPU from $0.128/h, etc.). [Pricing]
- Hobby limits: 1M function invocations, 4 h Active CPU, 100 GB transfer per month; functions run in a **single region** (selectable, e.g. `fra1`; there is no Amsterdam region); 1 hour of runtime logs. Over a limit, the feature pauses until 30 days have passed. [Hobby plan, Function regions]
- Cron: 100 jobs per project on every plan. **Hobby: once per day at most, with ±59 min precision.** Pro: per minute. [Cron usage]
- Preview deployments per branch/PR on all plans.

**Railway**

- Hobby: **$5/month, including $5 of usage**; Pro: **$20/month, including $20 of usage**. Usage beyond the credit is billed per second: about **$10/GB RAM-month**, **$20/vCPU-month**, **$0.15/GB-month** volume storage, **$0.05/GB** egress. [Pricing]
- Hobby: up to 5 GB volume storage, community support only, 7-day log history, "99.9 % availability target", described as "for hobbyist developers building side projects". Pro: up to 1 TB, Railway support, 30-day logs, "99.99 %". [Pricing]
- **Commercial use:** the Terms of Service (effective 2026-04-20) allow use "for your own internal, personal, and/or business use"; they contain **no non-commercial clause for Hobby**. But Railway "highly recommend[s]" Pro for commercial applications, and Railway staff have called a for-profit service "a pro workload" (forum, March 2024). [Terms, Pricing FAQ, Station]
- Region **EU West Metal, Amsterdam** (`europe-west4-drams3a`), available on Hobby. [Regions]
- **PR environments:** enabled per project. They are created when a PR opens and **deleted when it is merged or closed**. [Environments]
- **Cron:** a service runs its start command on a UTC schedule, at most every 5 minutes, and is billed only while it runs. [Cron jobs]
- **Backups:** volume backups on a daily/weekly/monthly schedule (kept 6/27/89 days); Postgres point-in-time recovery. The docs don't state clearly which plans include these; other sources say PITR is Pro-only. **To verify in M1.** [Backups, PITR]
- DPA available (GDPR; transfers under the EU–US Data Privacy Framework or SCCs; sub-processor list; signed through DocuSign). Railway states its primary processing takes place in the US (control plane). [DPA]

**Neon**

- Free: 0.5 GB storage per project, 100 CU-hours per project per month, 10 branches, **scale to zero after 5 minutes (can't be disabled on Free)**, **6-hour restore window**. Launch plan: pay per use ($0.106/CU-hour, $0.35/GB-month), restore window up to 7 days, scale-to-zero can be disabled. [Neon pricing]
- EU regions: AWS Frankfurt (`aws-eu-central-1`) and London. [Neon regions]

### Options

- **A. Accepted (v1.2) plan:** Vercel Hobby + Neon Free during the build → Vercel Pro + Neon Launch at G4.
- **B. All on Railway, EU West (Amsterdam):** Next.js (web + API) as a long-running Node service, Railway Postgres and a Railway cron service in one project. Hobby (already paid) during the build → Pro at G4.
- **C. Hybrid:** Vercel (web + API) + Railway Postgres in Amsterdam.
- **D. Cloudflare Workers** (the v1.2 fallback at G4), with Neon or Railway Postgres.

### Comparison

| Criterion | A. Vercel + Neon | B. Railway only (Amsterdam) | C. Vercel + Railway Postgres |
|---|---|---|---|
| **Build phase cost** | $0 (but see commercial use) | $5/month, **already paid**; a few $ extra if usage passes the $5 credit | Vercel $0 + Railway $5 |
| **Allowed for commercial use at G4** | Vercel Hobby **no** → Pro required. Arguably already a grey area during the build of a commercial product | ToS allows business use on Hobby; Railway recommends Pro. We treat **Pro as required at G4** (support, logs, backups) | Vercel Pro required |
| **Cost at pilot volume (G4)** | Vercel Pro $20 + Neon Launch ≈ $5–20 (or Neon Free with 6 h restore and cold starts) → **≈ $20–40/month** | Estimated usage ≈ $5–10/month (web ~0.5 GB RAM, Postgres ~0.25 GB, 1 GB volume, light CPU), fully covered by Pro's $20 credit → **$20/month flat** | ≈ $20 + $20 = **≈ $40/month**, plus egress over the public DB proxy |
| **Postgres** | Managed, serverless, branching, PITR. Free: cold start after 5 min idle (R14), 0.5 GB | Postgres in a container with a volume, on the private network. Always on, no cold starts. Single node; backups/PITR to verify per plan; major upgrades are our job | Railway Postgres reached over a public TCP proxy from Vercel |
| **Latency app ↔ DB** | `fra1` ↔ Neon Frankfurt, same AWS region: low | Same private network in Amsterdam: lowest | Frankfurt ↔ Amsterdam over the internet, ~10 ms per query round trip |
| **Preview / PR environments** | Vercel preview per push (great DX) + Neon branch per PR (copy-on-write of the parent, 10 branches on Free). Branching from production copies **real client data** into previews once the pilot runs, so previews must branch from a seeded dev branch | Railway PR environment per PR, deleted on merge/close. The database comes from migrations + seed (no real data). Billed by usage while it runs | Vercel previews; a shared or per-PR Railway DB to wire up by hand |
| **Cron for ADR-010** | Hobby: daily, ±59 min. Enough for ADR-010. Pro: per minute | Cron service, UTC, down to every 5 min on any plan. Enough for ADR-010, with room for an hourly job later without a queue | Either |
| **EU data residency** | Functions in `fra1`, DB in Frankfurt; CDN is global; build, logs and control plane in the US. Two US processors (Vercel, Neon) → two DPAs | App **and** DB in Amsterdam (NL). Control plane in the US. **One** processor, one DPA | Three places, two DPAs |
| **Ops and lock-in** | Least ops. Some Vercel-specific behaviour (ISR, cron config, image optimization) | Standard Node server + standard Postgres; easy to move (`pg_dump`, Dockerfile). More ops: DB backups, upgrades, monitoring are ours | Most moving parts |
| **Public booking speed (LCP < 2.5 s)** | Global CDN for static assets | Served from Amsterdam, close to Dutch users. No global CDN; Cloudflare (free) can be put in front if needed | Global CDN |

Option D (Cloudflare Workers) allows commercial use on the free tier, but running Next.js there needs the OpenNext adapter, Node-compatibility work for Better Auth and the Postgres driver, and Hyperdrive for DB connections. That is a lot of platform risk for the M1 walking skeleton, so it's not recommended now.

## Decision (proposed)

**Option B: host everything on Railway, in the EU West (Amsterdam) region.**

- **Production:** one Railway project with:
  - `web`: the Next.js app, including the Hono API (ADR-002/004), built as a standalone Node server (Dockerfile or Railpack);
  - `postgres`: Railway PostgreSQL with a volume, reachable only over the private network;
  - `cron`: a cron service that runs the daily jobs from ADR-010 (hold cleanup, recurrence horizon, retention) with the same code from `packages/domain`, then exits.
- **Environments:** `local` (Docker Postgres) → `preview` (a **Railway PR environment** per PR, with its own Postgres, migrated and seeded with demo data, deleted automatically on merge/close) → `production` (deployed only from `main`; migrations forward-only).
- **Plan:** stay on the **Hobby** plan the owner already pays during the build. **Upgrade to Pro ($20/month, includes $20 of usage) at Gate G4**, before real client data arrives. Pro gives us support, 30-day logs and the backup features E016 needs, and removes any doubt about commercial use.
- **Neon is not used.** The Vercel accounts stay unused for this project (no cost).
- **Before G4:** sign Railway's DPA and add Railway to the sub-processor list (`ROADMAP.md §4.4`).

### Conditions to verify in the M1 spike (E003)

The recommendation holds only if these are true. If one fails, fall back to Option A (with Vercel Pro from G4):

1. PR environments give each PR its own Postgres service that can be migrated and seeded automatically, and the cost of 3–4 open PRs stays within a few dollars a month (use Railway's service sleeping for idle previews if needed).
2. Scheduled Postgres backups and a restore into a scratch service work on the plan we are on at G4 (E016 restore drill).
3. The cron service can run the daily job with the privileged DB role (ADR-006) and report failures to Sentry (ADR-013).
4. The public booking page meets LCP < 2.5 s on a mid-range phone over 4G when served from Amsterdam (can be measured in M5; Cloudflare in front is the fallback).

## Consequences

- **Positive:** no extra spend during the build (the Hobby plan is already paid); at G4, a flat **$20/month** instead of roughly $20–40.
- **Positive:** app, database and cron in **one place in the Netherlands**, on one private network, with **one DPA**. No DB cold starts (removes a source of R14).
- **Positive:** PR environments clean themselves up on merge/close, which fits the cleanup rules in `WORKFLOW.md §5`, and previews never contain real client data.
- **Positive:** a standard Node server and standard Postgres are easy to move elsewhere.
- **Negative:** we operate Postgres ourselves: backups, restore drills, version upgrades, disk monitoring. It's a single node without high availability; that's acceptable for the pilot.
- **Negative:** no global CDN or Vercel preview comments. Previews are a bit slower to come up (a full service build per PR).
- **Negative:** Hobby has community support only and 7-day logs; fine during the build, not for the pilot (hence Pro at G4).
- **Negative:** it's not strictly "€0 until G4": the build runs on a plan the owner already pays, and heavy preview usage could go above the $5 credit.
- **Follow-ups if accepted:** update E003, the M1 environments note, the M9 restore drill ("Neon branch" → Railway scratch service), `ROADMAP.md §4.5` accounts, and the `WORKFLOW.md §5` cleanup item about Neon preview branches.

## Alternatives considered

| Option | Why not recommended |
|---|---|
| **A. Vercel Hobby + Neon Free → Vercel Pro + Neon Launch at G4** (the v1.2 decision) | Viable and lowest-ops, with the best preview DX. But it costs ≈ $20–40/month from G4, splits data across two US processors, has Neon Free cold starts and a 6-hour restore window, and Vercel Hobby's commercial-use clause is already a grey area while building a commercial product. **This is the fallback if the M1 spike fails.** |
| **C. Vercel + Railway Postgres** | Highest cost (two paid plans), DB traffic over the public internet between Frankfurt and Amsterdam, most moving parts |
| **D. Cloudflare Workers** | Commercial use allowed for free, but Next.js + Better Auth + Postgres on Workers adds adapter and compatibility risk to the walking skeleton |
| **Railway Hobby in production after G4** | Probably allowed by the current ToS, but Railway recommends Pro for commercial apps, and Hobby lacks support, has 7-day logs and may lack backups. Not worth the risk for real client and health data |

## References

Checked 22 September 2026:

- [Vercel fair use guidelines (commercial usage)](https://vercel.com/docs/limits/fair-use-guidelines)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) · [Vercel pricing](https://vercel.com/pricing)
- [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) · [Vercel function regions](https://vercel.com/docs/functions/configuring-functions/region)
- [Railway pricing](https://railway.com/pricing) · [Railway plans](https://docs.railway.com/reference/pricing/plans) · [Railway pricing FAQ](https://docs.railway.com/pricing/faqs)
- [Railway Terms of Service (effective 2026-04-20)](https://railway.com/legal/terms) · [Railway DPA](https://railway.com/legal/dpa)
- [Railway Station: commercial usage on Hobby](https://station.railway.com/questions/commercial-usage-using-hobby-plan-7fd8cf69)
- [Railway regions](https://docs.railway.com/reference/deployment-regions) · [Railway environments](https://docs.railway.com/guides/environments) · [Railway cron jobs](https://docs.railway.com/reference/cron-jobs)
- [Railway backups](https://docs.railway.com/volumes/backups) · [Railway PITR](https://docs.railway.com/volumes/point-in-time-recovery)
- [Neon pricing](https://neon.com/pricing) · [Neon regions](https://neon.com/docs/introduction/regions)
