# Open vragen voor de eigenaar / Open questions for the owner

> **⚠️ CONCEPT — GEEN JURIDISCH ADVIES.** Werklijst bij de juridische concepten in deze map. Alleen in het Engels, omdat het een interne werklijst voor de eigenaar is.
> **⚠️ DRAFT — NOT LEGAL ADVICE.** Working list for the legal drafts in this folder. English only, because it is an internal working list for the owner.

| | |
|---|---|
| **Versie / Version** | 0.1 · 22 september 2026 |
| **Blocks** | **G2** = before real data enters the platform (G2 is an internal alpha on synthetic data since roadmap v1.19; real data now first enters at pilot setup, before G4) · **Sign** = before the processor agreement is signed · **Publish** = before the privacy policy and terms go live (M5) · **G4** = before pilot go-live · **Later** = no rush |

Each question has a recommendation, so a short "agree" is a valid answer.

## Decisions

| # | Question | Recommendation | Blocks | Affects |
|---|---|---|---|---|
| **Q2** | **Legal entity.** Under which entity is Trainer Hub offered (eenmanszaak, VOF, BV)? We need the name, KvK number, address, a privacy email address and a support email address for every document | Decide before the processor agreement is signed; use a dedicated privacy@ address on the domain once it's bought | **Sign**, **Publish** | All documents (`{{…}}` placeholders) |
| **Q3** | **Pilot artefacts in M0.** The discovery kit collects the pilot's real Excel sheets and notes (`ROADMAP.md §4.1`). Where are they kept, and who can see them? | Keep them on the owner's machine only. Never commit them, paste them into an AI agent, or upload them to a preview. Use anonymized samples for design, and for the M9 import dry-run until the processor agreement is signed | **Now** | D8 in `role-mapping.md`, E015 |
| **Q4** | **Pilot gym's own paperwork.** Does the pilot gym have its own privacy notice for its clients, and an intake form? Should Trainer Hub provide a short template privacy notice for gyms? | Yes, provide a one-page template in a follow-up PR. Most small gyms don't have one, and they are the controller | **G4** | `privacy-policy.*` §2, terms A7 |
| **Q6** | **Railway DPA execution and health data.** Has Railway signed the submitted DPA, and does its processing schedule cover notes containing health data despite the published Exhibit A listing special-category data as “None”? | Keep the signed copy; obtain written clarification or amended terms before storing health data in notes. Document the US transfer mechanism | **G2** for execution; **M7** for health notes | `sub-processors.md` §3, ADR-011 |
| **Q7** | **Liability caps and breach timing.** The processor agreement art. 14 and terms A11 need an amount; the processor agreement art. 6 uses **48 hours** for breach notification to the gym | During the free pilot, a modest fixed cap (for example €2,500) that a lawyer confirms is reasonable; 48 hours is realistic for a solo operator | **Sign** | `verwerkersovereenkomst.md`, `terms.*` |
| **Q8** | **Consent for health notes.** How does the pilot gym get explicit consent (art. 9(2)(a)) before trainers record health information? Option 1: the gym handles it on paper or in its intake. Option 2: add an optional "consent to health data" field and a warning on the note screen (F046–F048) | Option 1 for the pilot; option 2 as a small scope addition to M7 (the owner decides, because it changes feature scope) | **G4** | `dpia-assessment.md` §4, F046–F048 |
| **Q9** | **Minors and vulnerable clients.** Does the pilot gym train clients under 16, or people in rehabilitation, and record health information about them? | If yes, a DPIA becomes effectively required (two WP248 criteria). Ask during the M0 shadow day | **G4** | `dpia-assessment.md` §3.2 |
| **Q10** | **Retention defaults.** OK with these defaults: 24 months of inactivity → anonymize guest data or ask the gym to review client records (auto-delete after 30 days without a response), a 30-day trash, 12-month audit log, 30-day backups? | Yes. They're easy to change later because they are constants (I1 in `retention-policy.md`) | **G4** (E014 builds them in M9) | `retention-policy.md` |
| **Q11** | **Minimum age for a client account.** 16 (the Dutch age of digital consent), or no account under 18? | 16; younger clients book through a parent | **Publish** | Privacy policy §10, terms B3 |
| **Q12** | **Data protection officer (FG/DPO).** We think neither Trainer Hub nor the pilot gym needs one: the core activity isn't large-scale processing of special categories. Agree? | Agree; re-check at 2.0 | **Later** | `dpia-assessment.md` §7 |
| **Q13** | **Review route.** `ROADMAP.md §4.4` asks for at least an LLM-assisted review, ideally a privacy professional once there is revenue. Which documents get which review before G4? | Complete a local LLM-assisted review of the drafts. Before the processor agreement is signed with real data, seek a one-off check of the **processor agreement** and the **privacy policy** by a privacy lawyer if the budget allows. Those two carry the most risk | **Sign**, **G4** | All documents |
| **Q14** | **Court and support.** Which court district (arrondissement) for disputes, and which support channel and response time for the pilot? | The district where the provider is established; support by email + WhatsApp with the pilot owner, with a response within 1 working day | **Sign** | Processor agreement art. 15, terms A8, A15 |
| **Q15** | **Terms for pricing changes.** Is 60 days' notice before charging, and 30 days' notice for us to terminate, acceptable? | Yes | **Publish** | Terms A4, A13 |
| **Q16** | **Trainers at the pilot gym.** Are the other trainers employees or freelancers? Do freelancers bring their own clients into the gym's workspace? | If freelancers train their own clients, those clients belong in the freelancer's own workspace (`role-mapping.md` §6.2), not the gym's. Confirm on the shadow day | **G2** | `role-mapping.md` §6 |

## Follow-ups (need owner approval to add to scope)

| # | Follow-up | Why | Where |
|---|---|---|---|
| **Q17** | Add rules D7 and D8 to `AGENTS.md`: Railway preview databases never come from production, and agents never get production data or real pilot files | Keeps the AI agents' providers out of the sub-processor list | `AGENTS.md`, `role-mapping.md` §7 |
| **Q18** | Where do the published legal texts live? They are user-facing long-form content, but `AGENTS.md` says all user-facing strings come from `packages/i18n`. Options: an exception for per-locale Markdown/MDX pages (`/privacy`, `/voorwaarden`), or storage in the catalogs | A documented exception: per-locale MDX pages rendered by the web app, linked from the native apps. Record it in the ADR-008 write-up | ADR-008, E005 |
| **Q20** | Terminology. These drafts use "workspace", "klant" and "owner". Align them with `packages/i18n/GLOSSARY.md` once it's merged | Legal texts and the UI should use the same words | All documents |

## Resolved decisions

| # | Decision | Outcome |
|---|---|---|
| **Q1** | Hosting and database | Railway EU West (Amsterdam) for web, API, cron and Postgres; ADR-011 accepted. DPA execution remains Q6 |
| **Q5** | Transactional email | Brevo selected and set up in E006 (2026-10-03): DPA (part of the terms), EU storage, limits, tracking and log retention checked; see `sub-processors.md §4` for what remains before G2 |
| **Q19** | Reconcile with merged ADRs | `sub-processors.md` synchronized with ADR-009, 011 and 013 |
| **Q21** | Hosting cost plan | `ROADMAP.md §12` already reflects Railway Hobby during the build and Pro at G4 |
