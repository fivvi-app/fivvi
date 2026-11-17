# ADR-030: The public website lives in apps/web at fivvi.app, rendered per request, the same for every visitor

| | |
|---|---|
| **Status** | Proposed (2026-11-06). The address and the timing are the owner's decisions; the build approach follows them; point 2 amended 2026-11-11 ([#720](https://github.com/fivvi-app/fivvi/issues/720)) |
| **Date** | 2026-11-06; point 2 amended 2026-11-11 |
| **Deciders** | Keyvan Mahmoudi (owner) |
| **Related** | ADR-002, ADR-008, ADR-020, ADR-026, ADR-029; [#611](https://github.com/fivvi-app/fivvi/issues/611); `docs/legal/open-questions.md` Q18; [`DECISIONS.md` §9](../design/prototype-v2/DECISIONS.md#9-public-website) |

## Context

The roadmap placed a marketing site in Release 2.0, on `www` or a path "later". On 6 November 2026 the owner moved it forward and chose the address: the main website is `https://fivvi.app`. Mollie checks a public website before it approves an account: a price and description, terms, the trade name with a KvK or VAT number, and contact details. The App Store needs a support and a privacy URL, and Google Play a public account deletion link. The site must also be found in Google in Dutch and English.

Today `/` is a hello page. The root layout reads the language from a cookie on each request, which makes every page dynamic and gives one URL per page, whatever the language.

## Decision

1. **The site lives in `apps/web`,** in a `(site)` route group with its own root layout, next to the app's. It has the same deployment and domain, and needs no new service or subdomain.
2. **Site pages are generated at build time.** They never read the session, a cookie or the database, so they're fast, cacheable and complete in the HTML without JavaScript.

> **Amended (11 November 2026, [#720](https://github.com/fivvi-app/fivvi/issues/720)):** site pages render per request, the same for every visitor, instead of being generated at build time. A page can't get the nonce of its Content-Security-Policy at build time: Next.js puts the nonce on its own inline scripts while it renders a request, so a page built in advance would have scripts the policy blocks. The site's root layouts and `global-not-found` wait for the request (`connection()`); the pages still read no session, cookie or database and set no cookie. The effect is on caching: no HTML is built in advance, so every visit renders on the server, and a CDN in front of the site (none today) could not cache the page. `/_next/static` stays static and cacheable, and the files in `public/` are not rendered. The alternative, a hash-based policy for static pages (Next.js `experimental.sri`), does not cover the inline scripts, so it was not chosen.

3. **The language comes from the path:** Dutch at `/`, English at `/en`, each with its own URLs, `hreflang` and canonical. Nothing redirects by the browser's language, so search engines and visitors see the same thing.
4. **`proxy.ts` lists the site's paths as public.** A signed-in user who opens `/` goes to their home; the site page isn't touched.
5. **Everything but the site stays out of search engines:** `noindex` on the app, sign-in, booking and join pages and the API, and on everything in every environment except production.
6. **Words:** site strings live in `packages/i18n` under `site.*`, not exported to the native catalogs, as `email.*`. **Legal texts are the exception** to "the only source is `packages/i18n`": they stay per-locale Markdown in `docs/legal`, rendered at build time, because they're long, need a lawyer's review and the owner's merge (Q18). A `{{…}}` value or a draft notice in them fails the build, so an unfinished text can't be published.

## Consequences

- Moving the app's pages under a second root layout touches the routes and their tests once. The route guard stays the single list of what's public.
- A deployment is needed to change a word on the site. That's fine at this size, and no CMS is needed.
- Going live waits on the owner's details and the updated legal texts ([#158](https://github.com/fivvi-app/fivvi/issues/158), [#611](https://github.com/fivvi-app/fivvi/issues/611)), and the site's look needs the Design v2 token values first ([#590](https://github.com/fivvi-app/fivvi/issues/590)).

## Alternatives considered

- **A separate app or a hosted site builder on `www`.** More to run, a second design system to keep in step, and `fivvi.app` would still need its root page. The owner wants the main site on `fivvi.app`.
- **Language by cookie on one URL, as in the app.** Search engines would only ever index one language.
