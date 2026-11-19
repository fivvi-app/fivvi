# Interview 02: a pilates studio owner on aggregators, company-paid sport and personal contact

| | |
|---|---|
| **Date** | 19 November 2026 |
| **With** | A pilates studio owner (S1), not the pilot gym; a short, informal conversation |
| **Source** | The product owner's summary of the conversation, typed up afterwards. Not a recording or a verbatim transcript; the lines below are paraphrases |
| **Led to** | Three post-MVP ideas: [#1477](https://github.com/fivvi-app/fivvi/issues/1477) (aggregators), [#1478](https://github.com/fivvi-app/fivvi/issues/1478) (bedrijfssport), [#1479](https://github.com/fivvi-app/fivvi/issues/1479) (birthdays and milestones). No change to the go-live scope (ADR-033) |

**Evidence labels:** **R** = reported by S1. **U** = reported, details unclear. **H** = our interpretation, or found in web research on 19 November 2026 (sources in the issues). One short interview is not a market-wide requirement.

No client names, bank details, agreements or invoices were shared or recorded.

## 1. What S1 reported

1. **Aggregators.** S1 already sells spots through ClassPass or a similar platform; connecting it to the studio's booking software matters to S1 (R). Which platforms, and how many spots a week, is not known (U).
2. **Bedrijfssport.** Handling *bedrijfssport*, clients who pay through their company, would take away a real pain (R). Whether the employer pays the studio directly, an intermediary pays it, or the client claims the cost back is not known (U).
3. **Personal contact.** S1 would like to know when it is a client's birthday, to greet them, and wants a more personal relationship with clients in general (R).

## 2. What we concluded (H)

1. **None of the three was planned.** Aggregators were "not planned" (`competitors.md`). Company billing covers only a company name, address and VAT number on the client's invoice (`PRODUCT.md §96`), and payments outside Fivvi can be recorded (F065). A date of birth is deliberately not collected (`docs/legal/role-mapping.md`, the DPA, the importer).
2. **Aggregators and bedrijfssport overlap.** Urban Sports Club (with OneFit) and Wellhub, one company since 2025, are both an aggregator and the main employer-paid channel; Epassi (formerly Bedrijfsfitness Nederland) and benVitaal are the other intermediaries. In every case the intermediary pays the studio itself, so Fivvi would never handle that money. What a studio needs from Fivvi is that those clients and their bookings are in the one calendar, with correct capacity, and a list to reconcile the payouts.
3. **Every aggregator works without an integration** (a manual partner portal), at the cost of double entry. Wellhub has public API docs and a free request form; ClassPass gates its API to approved vendors; Urban Sports Club has no public vendor programme. Our NL competitors (Gymly, Virtuagym, Sportbit, Huppa, Eversports) already list Urban Sports Club.
4. **The birthday wish can start without new personal data.** Milestones from bookings Fivvi already has (a first class, the 50th class, a year as a client) give the trainer a reason for a personal word. A birthday itself would be an optional day and month, shown only to the team, and needs the owner's decision and an update of the legal documents.

Not shown by this interview: which aggregators and intermediaries S1 uses, how many clients come through them, how S1 handles company-paid clients today, and whether these needs would make S1 switch.

## 3. Follow-up

Questions for a next conversation with S1:

- Which platforms (ClassPass, Urban Sports Club, Wellhub, Epassi, benVitaal) and roughly how many visits a month through each? What is done by hand for them today?
- Bedrijfssport: who pays S1, the employer, an intermediary, or the client who claims it back? What is the pain: invoices, checking who is still eligible, reconciling payouts?
- Birthdays: would a badge on the class list on the day be enough? Would milestones (50th class, a year as a client) be just as welcome?
- Which booking software S1 uses now, and what would make S1 switch.
