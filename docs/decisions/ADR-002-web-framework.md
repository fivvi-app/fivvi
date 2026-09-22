# ADR-002: Web framework

| | |
|---|---|
| **Status** | Accepted (2026-09-22) |
| **Date** | 2026-09-22 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | PRODUCT.md §21, §71, §75; ROADMAP.md §4.3, M1, M5; ADR-004, ADR-008, ADR-011, ADR-015 |

## Context

The web app covers four surfaces (`PRODUCT.md §71`): the trainer dashboard, public booking, client web and organization administration. Public booking is the most sensitive for speed: clients open it on a phone from a QR code, often on mobile data, and the M5 budget is LCP < 2.5 s on a mid-range phone over 4G. The web app also hosts the API (ADR-004), so one deployable serves both.

## Decision

- **Next.js with the App Router**, **TypeScript in strict mode**.
- Public booking and client web pages are **server-rendered** (React Server Components). They ship as little client JavaScript as possible.
- The trainer dashboard may use client components where interactivity needs them (calendar, logging).
- The REST API (ADR-004) is mounted in Next.js route handlers, so web and API deploy together.
- Localization through next-intl, reading the shared catalogs (ADR-008).

## Consequences

- **Positive:** server rendering gives a fast first paint for public booking without a separate SSR setup. One framework for four surfaces and the API host.
- **Positive:** large ecosystem; well known to both coding agents.
- **Negative:** the App Router has a learning curve (server vs client components, caching rules). Agents must follow explicit conventions for data fetching and caching, written down in M1.
- **Negative:** the API shares a process and a deploy with the web app. That is fine at pilot scale. If the API ever needs to scale separately, `packages/api` is a standalone Hono app and can move to its own service without a rewrite.
- **Follow-ups:** the deployment target is set by ADR-011; the choice of Next.js does not depend on a specific host.

## Alternatives considered

| Option | Why not |
|---|---|
| Vite + React SPA | No server rendering; public booking would load slower on phones |
| Remix / React Router framework | Viable, but Next.js is the spec's recommendation (§71) and has the larger ecosystem |
| SvelteKit / Nuxt | Different component model from the rest of the React/TS tooling (React Email, shadcn/ui) |
| Separate API server from day one | Two deployables to run on free tiers without a real need; the Hono app keeps that option open |

## References

- `PRODUCT.md §71` Web stack
- `ROADMAP.md` M5 (performance budget)
