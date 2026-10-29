# Phone inventory: results

| | |
|---|---|
| **Date** | 29 October 2026 |
| **Source** | Quick questions 14 and 15 ([`quick-questions.md`](quick-questions.md)), asked of the gym owner (T1) about the whole team, answers relayed in chat |
| **Template** | [`../phone-inventory.md`](../phone-inventory.md) |
| **Privacy** | Trainer codes only. No phone numbers, device IDs or account emails |

## Summary table

| Code | Uses app in pilot | Platform | Model | OS version | Update waiting → | Change phone < 6 mo | Phone language | Text size | Gym-floor connectivity |
|---|---|---|---|---|---|---|---|---|---|
| T1 | Yes (gym owner) | Android | Samsung S24 | Not checked (launched with Android 14) | Not checked | Not asked | Not asked | Not asked | Not asked |
| T2 | Not asked | Android (probably) | Not given | Not checked | Not checked | Not asked | Not asked | Not asked | Not asked |
| T3 | Not asked | Android (probably) | Not given | Not checked | Not checked | Not asked | Not asked | Not asked | Not asked |
| T4 | Not asked | Android (probably) | Not given | Not checked | Not checked | Not asked | Not asked | Not asked | Not asked |
| T5 | Not asked | Android (probably) | Not given | Not checked | Not checked | Not asked | Not asked | Not asked | Not asked |

The gym owner said "mostly Android, not very old ones, maybe 3–4 years old" for the other four trainers. There may be one iPhone among them; that is not confirmed. All of this is an **estimate**.

- **Platform split:** Android 4 or 5 · iOS 0 or 1 (not confirmed)
- **Lowest iOS version:** unknown (no confirmed iPhone)
- **Lowest Android version:** not checked. A phone 3–4 years old (2022–2023) launched with Android 12 or 13 (API 31–33), and the S24 with Android 14 (API 34). This is an inference from the age, not a reading from the phones

## Minimum OS versions (ADR-003)

Decision rule of [`../phone-inventory.md` §4.2](../phone-inventory.md#42-decision-rule), applied on 29 October 2026:

| Platform | Minimum | Step | Why |
|---|---|---|---|
| iOS | **iOS 17.0** (unchanged default) | 4 | No confirmed pilot iPhone, so the default stands. iOS is still built (ADR-003) but gets no real-world pilot testing (R9): plan at least one physical iPhone for the device tests |
| Android | **Android 8.0 (API 26)** (unchanged default) | 2 | Every pilot phone is believed to be at API 31 or higher, well above the default. The pilot phones are newer than the floor, which is not a reason to raise it |

The app shells already use these values: `IPHONEOS_DEPLOYMENT_TARGET = 17.0` in `apps/ios/FivviPro.xcodeproj` and `minSdk = 26` in `apps/android/app/build.gradle.kts`. The decision changes no code.

## Still open

These need five minutes with each trainer ([`../phone-inventory.md` §2](../phone-inventory.md#2-form-one-per-trainer)). None of them can change the decision unless a trainer turns out to have a phone below the minimum or an iPhone older than XS / XR:

- [ ] Platform and model of T2–T5, and whether any of them has an iPhone.
- [ ] OS version of each phone, after any update that is waiting (T1 included).
- [ ] Whether each trainer will use the app in the pilot, and agrees to install the TestFlight / Google Play test version (item 17 of the form). The E017 checklist collects the accounts.
- [ ] Phone language and text size (they feed the NL/EN defaults and the accessibility checks in M9), and the connectivity on the gym floor (R12).
