# Phone inventory

**Purpose:** find out which phones the pilot trainers will use for the trainer app, so we can set the **minimum iOS and Android versions** (`ROADMAP.md §4.1`, ADR-003) before the native app shells are created in M1 (E008). The minimum OS is part of Gate G0.

**Who:** every person who will use the trainer app in the pilot, **including the gym owner (T1)**. It takes about 5 minutes per trainer; you can do it together with the short interview in [`shadow-day-guide.md` §5.10](shadow-day-guide.md#510-short-version-for-other-trainers--korte-versie-voor-andere-trainers).

**Privacy:** use the trainer code (T1, T2, …) only. **Do not record** phone numbers, IMEI or serial numbers, Apple ID or Google account email addresses. The account needed for TestFlight / Play internal testing is collected separately in M8 (E017).

---

## 1. How to find the version (read out to the trainer)

**iPhone**

Open **Instellingen → Algemeen → Info**. Kijk bij **iOS-versie** en **Modelnaam**. Kijk daarna bij **Instellingen → Algemeen → Software-update** of er een update klaarstaat.\
*Open Settings → General → About. Look at iOS Version and Model Name. Then check Settings → General → Software Update to see whether an update is waiting.*

**Android**

Open **Instellingen → Over de telefoon** (Samsung: **Instellingen → Telefooninfo → Software-informatie**). Kijk bij **Android-versie**, **Modelnaam** en **Android-beveiligingsupdate**. Kijk daarna bij **Instellingen → Software-update** (of **Systeem → Systeemupdate**) of er een update klaarstaat.\
*Open Settings → About phone (Samsung: Settings → About phone → Software information). Look at Android version, Model name and Android security update. Then check Settings → Software update (or System → System update) to see whether an update is waiting.*

Menu names differ a little per brand and version. If you can't find it, search for "versie" or "version" in Settings.

---

## 2. Form (one per trainer)

*Print one copy per trainer.*

| | Vraag / Question | Antwoord / Answer |
|---|---|---|
| 1 | Trainercode / *Trainer code* | T___ |
| 2 | Rol / *Role* | ☐ Eigenaar / *Owner* ☐ Trainer ☐ Anders / *Other*: ______ |
| 3 | Ga je de trainersapp tijdens de pilot gebruiken? / *Will you use the trainer app during the pilot?* | ☐ Ja / *Yes* ☐ Nee / *No* ☐ Weet nog niet / *Not sure* |
| 4 | Platform | ☐ iPhone (iOS) ☐ Android |
| 5 | Merk en model / *Make and model* (bijv. / e.g. iPhone 13, Samsung Galaxy A54) | |
| 6 | OS-versie / *OS version* (bijv. / e.g. iOS 18.6, Android 14) | |
| 7 | Alleen Android: beveiligingsupdate (datum) / *Android only: security update (date)* | |
| 8 | Staat er een update klaar? Zo ja, naar welke versie? / *Is an update waiting? If so, to which version?* | ☐ Nee / *No* ☐ Ja / *Yes* → ______ |
| 9 | Automatische updates aan? / *Automatic updates on?* | ☐ Ja / *Yes* ☐ Nee / *No* ☐ Weet niet / *Don't know* |
| 10 | Is dit je eigen telefoon of een telefoon van het werk? Deel je hem met iemand? / *Is this your own phone or a work phone? Do you share it?* | ☐ Eigen / *Own* ☐ Werk / *Work* ☐ Gedeeld / *Shared* |
| 11 | Ben je van plan binnen 6 maanden een andere telefoon te nemen? Welke? / *Do you plan to change phones within 6 months? Which one?* | ☐ Nee / *No* ☐ Ja / *Yes* → ______ |
| 12 | Taal van je telefoon / *Phone language* | ☐ Nederlands ☐ English ☐ Anders / *Other*: ______ |
| 13 | Tekstgrootte / *Text size* | ☐ Standaard / *Default* ☐ Groter / *Larger* ☐ Kleiner / *Smaller* |
| 14 | Gebruik je voor je werk ook een tablet? Welk platform en welke versie? / *Do you also use a tablet for work? Which platform and version?* | ☐ Nee / *No* ☐ Ja / *Yes* → ______ |
| 15 | Waar is je telefoon tijdens een training? / *Where is your phone during a session?* | ☐ Broekzak / *Pocket* ☐ Bank of rek / *Bench or rack* ☐ Houder / *Stand* ☐ Anders / *Other*: ______ |
| 16 | Werkt wifi of mobiel internet goed op de trainingsvloer? / *Do Wi-Fi or mobile data work well on the gym floor?* | Wifi: ☐ goed / *good* ☐ matig / *patchy* ☐ geen / *none* · Mobiel / *Mobile*: ☐ goed / *good* ☐ matig / *patchy* ☐ geen / *none* |
| 17 | Vind je het goed om een testversie van de app te installeren via TestFlight (iPhone) of een testlink van Google Play (Android)? / *Are you OK installing a test version of the app via TestFlight (iPhone) or a Google Play test link (Android)?* | ☐ Ja / *Yes* ☐ Nee / *No* ☐ Wil eerst meer weten / *Want to know more first* |
| 18 | Opmerkingen / *Remarks* | |

*Items 12 and 13 feed the NL/EN defaults and the accessibility checks (Dynamic Type / font scaling, M9). Item 16 feeds R12 (weak gym connectivity).*

---

## 3. Summary table (for `results/phone-inventory.md`)

Combine all forms into one table. Codes only.

| Code | Uses app in pilot | Platform | Model | OS version | Update waiting → | Change phone < 6 mo | Phone language | Text size | Gym-floor connectivity |
|---|---|---|---|---|---|---|---|---|---|
| T1 | | | | | | | | | |
| T2 | | | | | | | | | |
| T3 | | | | | | | | | |
| T4 | | | | | | | | | |
| T5 | | | | | | | | | |

- **Platform split:** iOS ____ · Android ____
- **Lowest iOS version** (after the waiting updates): ________ on ________
- **Lowest Android version** (after the waiting updates): ________ (API ____) on ________

---

## 4. How the result sets the minimum OS versions (ADR-003)

The minimum OS is set **once, before E008** (native app shells, M1). You can raise it later without much trouble, but lowering it later means rewriting code that relied on newer APIs. So it is chosen deliberately.

### 4.1 Proposed defaults

| Platform | Proposed minimum | Why this default |
|---|---|---|
| iOS | **iOS 17.0** | SwiftUI's Observation framework (`@Observable`) needs iOS 17. Supporting older versions means a second state-management pattern across the app. iOS 17 runs on iPhone XS / XR and newer, and on the iPhone SE (2nd generation) and newer |
| Android | **Android 8.0 (API 26)** | `java.time` is available natively from API 26, which matters for timezone-correct scheduling (ADR-012) without extra desugaring. Almost every Android phone still in use runs API 26 or higher |

*Before recording the decision, check that the current Xcode and Android Gradle Plugin / Compose releases still support these versions. Toolchain minimums move up over time. Note: Google Play's yearly "target API level" rule is about `targetSdk`, not the minimum. It doesn't change this choice.*

### 4.2 Decision rule

Apply these in order, once the summary table is complete:

1. **Every pilot trainer's phone must be supported.** The pilot fails if a trainer can't install the app (§8: active trainers = 100 %). Use the version the phone will have **after** installing any update that is already waiting (form item 8).
2. **All pilot phones at or above the default → keep the default.** Don't raise the minimum just because the pilot phones are newer. Release 2.0 opens the app to other trainers (`ROADMAP.md §9`), and a higher floor would exclude them for no reason. Only raise it for a concrete API the MVP needs, and write that API down in the ADR.
3. **A pilot phone is below the default:**
   1. It can update to the default or higher → ask the trainer to update before M8. Keep the default.
   2. It can't update (the device is too old) → decide with the gym owner:
      - **Lower the minimum** to that version, if the extra cost is small. Estimate the cost first: for example, iOS 16 means an `ObservableObject` fallback throughout the app, which is not small.
      - Or the trainer **changes phones** before M8 (form item 11 may already answer this).
      - Or the trainer uses **trainer web in the phone's browser** for the pilot. This is a limited fallback without the mobile logger. It is acceptable for a trainer with few sessions, not for the gym owner.
4. **A platform with no pilot trainers is still built** (ADR-003: iOS and Android both). Flag it: that platform gets no real-world pilot testing (R9). Plan at least one physical test device for it.
5. **Test devices:** per platform, test on at least one real device at the minimum version (or the lowest pilot phone) and one on the latest OS. Use simulators and emulators for the rest.

### 4.3 Recording the decision

- [ ] Add a **"Minimum OS versions"** section to the ADR-003 write-up in `docs/decisions/`. Include the chosen minimum per platform, the date, the platform split and version counts from the summary table (no names or codes needed), and which step of the decision rule was applied and why.
- [ ] Put the same values in `results/phone-inventory.md`.
- [ ] E008 uses them as the Xcode deployment target and the Gradle `minSdk`.
- [ ] Any device-specific follow-up (a trainer must update or change phones before M8) goes on the M8 checklist.
