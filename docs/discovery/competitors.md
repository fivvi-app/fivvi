# Competitors

Products a Dutch gym or PT studio could choose instead of Trainer Hub, and what we learn from each. Read with [`PRODUCT.md §2.0`](../product/PRODUCT.md) (simple is the product) and risk R22 in [`ROADMAP.md §13`](../product/ROADMAP.md#13-risk-register).

- **Sources:** the companies' public websites, read on 21 October 2026, unless a line says otherwise. Marketing claims are recorded as claims, not as checked facts.
- **Not here:** prices we haven't seen published, people's names, and anything from a demo or a customer that isn't public.
- **Update** this file when a pilot or interview names a product, or when a product changes in a way that matters to us.

## Summary

| Product | From | Who it's for | Closest to us in | Status |
|---|---|---|---|---|
| [Huppa](#huppa) | Amsterdam, NL | Gyms, CrossFit boxes, studios, PT and small group | Almost everything: members, bookings, payments and invoices in one platform, Mollie, member apps | **Closest competitor.** The owner likes it (21 October 2026) |
| [Trainin](#trainin) | NL | Personal trainers and fitness businesses | Session credits, recurring payments, invoicing, cancellation rules, migration help | Named in the interview 01 review, not studied yet |
| [bsport](#bsport) | FR, sold in NL | Boutique studios | Private and group services, memberships and passes | Named in the interview 01 review, not studied yet |
| [Virtuagym](#virtuagym) | Amsterdam, NL | Gyms of every size, PTs | All-in-one suite | The pilot owner sees it as expensive (interview 01, not checked) |

## Huppa

[huppa.app](https://www.huppa.app/en/): "the digital manager for your gym, box, or studio".

**Company.** Based in Amsterdam, with Dutch support 7 days a week (their claim). It announced a €1M pre-seed round on 12 October 2026, from founders of Dutch software companies (among them Moneybird and TicketSwap) and NL SportTech Ventures. It names **Mollie** as its payments partner, including Mollie Capital for working capital. That is the provider ADR-020 proposes for us.

**Who it's for.** CrossFit, martial arts, HYROX, yoga and Pilates, indoor cycling and rowing, and **PT and small group training**. Its PT page offers trainer availability with clients booking sessions themselves, lead intake and workouts for small groups.

**What it offers** (from its platform pages):

| Area | Huppa | Trainer Hub plan |
|---|---|---|
| Member app | Branded member app for iOS and Android: book classes, buy or upgrade a membership, buy credits and products | Client web in the MVP; client apps in Release 1.2. Trainer apps in parallel from M2 |
| Leads | Booking widget for trial lessons, automatic lead follow-up | Public booking page and QR codes (M5, M6); no lead follow-up planned |
| Bookings | Waiting lists, credits, no-shows, bring a friend | Credits (group and private, never mixed), cutoff, makeups (M11); waitlists are a 1.1 candidate |
| Finance | "Closed-loop finance": automated payments, invoices, reminders and follow-up; flexible payment methods | Recurring payments and invoices together, failed-payment handling, payouts (proposed) (M11); reminders and dunning beyond that in Release 4 (`PRODUCT.md §66`) |
| Business clients | Company accounts that bill business ride passes or memberships | Billing details with a company name on invoices (`PRODUCT.md §96`); no separate company accounts |
| Selling | In-app shop for merchandise and products; discount codes | Excluded from the MVP (`PRODUCT.md §53`: discounts); no shop planned |
| Families | Family accounts: a parent books for children | Excluded from the MVP (`PRODUCT.md §53`); Release 4 (`PRODUCT.md §66`) |
| Training | Workout programming, members log results (time, weight, reps) | Trainer-led live logging and notes (M7, after go-live) |
| Data | KPI dashboard (revenue, members, VAT); "Huppa AI" answers questions about the data | Analytics in Release 3.2; no AI on business data planned (AI note capture is Release 1.3) |
| Team | Access for coaches, managers and administrative staff by responsibility | Owner and Trainer only in the MVP (decision 13) |
| Locations | Multiple locations; a year of schedule ahead; bulk changes | One location at go-live (decision 12); more after go-live |
| Pricing model | One fixed price per active customer, all features, no modules (their claim; the amount isn't published) | Platform pricing is open (decision 16) |
| Partners | Mentions Urban Sports Club and ClassPass as part of gyms' business | Not planned |

**Where Huppa is ahead.** It has customers (its words), funding and a team, has member apps on both platforms, and covers more ground: shop, discounts, family and company accounts, insights and AI. It is built around the gym and its members.

**Where we can be different.** These are hypotheses to test with the pilot and the second interview, not facts:

1. **Simpler, not bigger.** Huppa grows by adding features (shop, discounts, AI, partners). Our edge is fewer steps for the daily work and nothing to set up that the platform can know (`PRODUCT.md §2.0`). Interesting: Huppa's own principles include *via negativa*: "the greatest improvements come from removing what doesn't work". So simplicity alone won't set us apart; how simple the daily flows feel in practice will.
2. **The trainer, not only the gym.** Trainer Hub treats the trainer as a person with one account across workspaces: a trainer at a gym can also run their own PT business, with one personal calendar (`PRODUCT.md §4–§6, §47`). Huppa reads as one gym's system.
3. **Private training next to group classes.** The pilot's pain was private training managed by hand next to an app for classes. We plan one calendar, private and group credits, and private invoices made automatically. Huppa's PT offer looks strong; check how it bills private sessions and company invoices in practice.
4. **Bilingual everywhere.** Dutch-first with full English on every surface. Huppa's site has Dutch and English; check whether the member app and emails do too.

**What we take from Huppa** (the owner likes it):

- **Company billing** confirms the pilot's need for invoices in a company's name (`PRODUCT.md §96`).
- **Members buy and upgrade themselves** in the app: in our MVP clients confirm agreements and (proposed) buy single classes on the web (`PRODUCT.md §91, §95`); keep that path as short as Huppa's.
- **Trial lessons** as a first booking: candidate for the booking page (M5) or 1.1.
- **One all-inclusive price** is a clear message for platform pricing when decision 16 comes up.

**To find out** (owner, not from the website): what a gym pays, how long switching takes, how private sessions and company invoices work in the app, whether trainers who work at several gyms can use one account, and whether the pilot owner knows Huppa or has looked at it. A demo with Huppa answers most of these.

## Trainin

[trainin.nl](https://www.trainin.nl/personal-training-software). Named in the interview 01 review: it markets session credits, recurring payments, invoicing, cancellation controls and migration support for Dutch fitness businesses. Not studied further yet.

## bsport

[bsport](https://pro.bsport.io/studios). Named in the interview 01 review: it markets tools for private and group services and membership and pass management. Not studied further yet.

## Virtuagym

[virtuagym.com](https://business.virtuagym.com/). The pilot owner sees it as expensive (interview 01, [`results/interview-01.md`](results/interview-01.md)); not compared yet.
