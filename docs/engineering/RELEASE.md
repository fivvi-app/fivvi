# Releasing the native apps

How a build of **Fivvi Pro** (`apps/ios`, `apps/android`, app ID `app.fivvi.pro`) gets to testers, what the owner does and approves, and what the stores require before a public release (E017, [spec #169](https://github.com/fivvi-app/fivvi/issues/169)). Native apps have no over-the-air updates ([`ROADMAP.md`](../product/ROADMAP.md) R15): every fix for a tester is a new build, so building and shipping one is a single, repeatable step.

Status: the `release` environment, the secret scripts and this document are in place ([#189](https://github.com/fivvi-app/fivvi/issues/189)), and so are the iOS lane to TestFlight ([#190](https://github.com/fivvi-app/fivvi/issues/190)) and the Android lane to Play internal testing ([#191](https://github.com/fivvi-app/fivvi/issues/191)), both in `.github/workflows/release.yml`. They have not run for real yet: the first approved run is the owner check ([#192](https://github.com/fivvi-app/fivvi/issues/192)). Where this document and the spec differ, the spec issue wins until the lanes are built; then fix this document.

## 1. Who does what

| | May | May not |
|---|---|---|
| **Owner** | Holds every account and secret, approves every release run, adds testers | |
| **Agent** | Change the lanes in a PR, start a run | Approve a run, read or ask for a secret, run `scripts/release-secrets.sh`, create an account |
| **Anyone else**, a fork's pull request included (the repo is public) | | Start a run or reach a secret |

Why this is safe: every release job runs in the GitHub environment **`release`**. The environment needs the owner's approval for each deployment and only deploys from `main` (`.github/environments/release.json`). Pull-request workflows and forks can't read its secrets. "An agent can't approve" is how the process is set up, not a rule GitHub enforces for the owner's token: agents work with the owner's admin `gh` token ([`docs/agents/tools.md`](../agents/tools.md#github)), so the environment turns off *Allow administrators to bypass* (`can_admins_bypass: false`) and every release job runs on `workflow_dispatch` only, never on `pull_request_target` (which runs with the base branch's secrets and code on a pull request's event). A secret never appears in the repo, a workflow log or an artifact: the scripts read it from a file outside the repo or a hidden prompt and pass it to `gh secret set` through a pipe, and the workflows must never echo one.

## 2. Set up once (the owner)

The order matters; the checklist in §8 has the account steps with what each unlocks.

1. **Apply the environment.** `scripts/github-settings.sh apply` (needs a token with admin rights on the repo; it is idempotent and also re-applies the ruleset, merge settings and labels). It creates `release` with you as the required reviewer and allows deployments from `main` only. Check it: `gh api repos/{owner}/{repo}/environments/release --jq '.protection_rules'`.
2. **Put the secrets in.** `scripts/release-secrets.sh` (run it yourself, in a terminal; never in an agent session). Values are never printed, never on a command line, never written to a file, and a key file inside the repo is refused.

   | Command | Secrets it sets | Where the values come from |
   |---|---|---|
   | `release-secrets.sh ios` | `IOS_DISTRIBUTION_CERTIFICATE` (base64 `.p12`), `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE` (base64), `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY` (the `.p8`) | The files from Apple's developer site (§8) and hidden prompts |
   | `release-secrets.sh android-keystore` | `ANDROID_UPLOAD_KEYSTORE` (base64), `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD` | Makes the upload keystore (needs `keytool`, part of the JDK from `scripts/bootstrap.sh --api`) in `~/fivvi-release-keys/` unless `--dir` says otherwise, outside the repo; you choose its password at a hidden prompt |
   | `release-secrets.sh android` | The same four | A keystore you already have (`--keystore`) |
   | `release-secrets.sh play` | `PLAY_SERVICE_ACCOUNT_JSON` | The service-account key file (`--service-account`) |
   | `release-secrets.sh sentry` | `SENTRY_AUTH_TOKEN` | A hidden prompt; an organisation auth token (`org:ci`: releases and debug files), like the one of the web source-map upload |
   | `release-secrets.sh list` | none | Prints which of the release secrets above are set, by name |

3. **Back up the upload keystore** and its password in your password manager. Play App Signing holds the app signing key; the upload key can be reset through Google if it is lost, but that takes time and a support request.

Renew by running the same command again; it replaces the value. The Apple Distribution certificate and the provisioning profile expire after a year ([decision 4](https://github.com/fivvi-app/fivvi/issues/169)): put a reminder in your calendar and run `release-secrets.sh ios` with the new files before they lapse, or the iOS lane fails at signing.

## 3. Starting a release run

The lanes are one GitHub Actions workflow, **Release** (`.github/workflows/release.yml`), started by hand (`workflow_dispatch`) from `main`. It holds the iOS lane ([#190](https://github.com/fivvi-app/fivvi/issues/190)) and the Android lane ([#191](https://github.com/fivvi-app/fivvi/issues/191)); a platform can be released alone, and Android can be built without publishing (the workflow's inputs, below).

1. Start it from the Actions tab (*Release › Run workflow*, branch `main`), or with `gh workflow run release.yml --ref main`. An agent may do this too. A run started from any other branch, or by anything but a person, stops in its first step with nothing built or uploaded, and the `release` environment doesn't deploy from another branch either.
2. **Prepare** gives the run its build number (below). The native suites of both platforms then run on that commit, in Dutch and in English ([`TESTING.md §7`](TESTING.md#7-where-tests-run)), without any secret: **iOS tests** (`pnpm test:ios`, a macOS runner) and **Android tests** (`pnpm test:android` and `pnpm test:maestro`, a Linux runner with the emulator). The release jobs need both, so when either suite fails the run stops there: no release job starts, and nothing is signed or uploaded, for either platform.
3. **You approve.** When the tests have passed, the **iOS release** and **Android release** jobs wait in the `release` environment. GitHub emails you and shows *Review deployments*; check that the commit is the one you mean to ship and that the build number is the one you expect (it is in the run's summary), then approve (one approval covers both jobs). Nothing signs or uploads before that, and no secret is readable before it.
4. The job then installs the Apple Distribution certificate into a keychain made for this run and the App Store profile where Xcode finds it, archives the Release configuration (the production address, the shared version, the run's build number) with `xcodebuild`, uploads the dSYMs to the Sentry `ios` project under the release name the app sends (`app.fivvi.pro@<version>+<build>`), and exports and uploads the build to App Store Connect with the API key. The keychain and the key files are deleted at the end, whatever failed. No fastlane and no Ruby: `scripts/release-ios.sh` runs `xcodebuild`, `security` and `sentry-cli` (the version pinned in `pnpm-lock.yaml`).
5. Testers get it from the TestFlight app, usually within minutes: App Store Connect first processes the build and emails you when it is done. The build is then available to the internal testers with no further step.

**The Android job** (`scripts/release-android.sh`, after your approval):

1. Writes the upload keystore from its secret to a private file outside the repo, checks that it opens and holds the key alias, and installs the SDK platform and build tools of the build (no emulator: the suites ran before).
2. Builds the release App Bundle with Gradle (`:app:bundleRelease`), the production address, the shared version and the run's build number as `versionCode`, signed with the upload key (Gradle reads the keystore path and the passwords from the environment), and checks the signature with `jarsigner`.
3. Keeps the signed bundle, alone, as the artifact **android-app-bundle** of the run (14 days). It holds a certificate and no secret. Use it for the first upload by hand (§8 Google).
4. Uploads the R8 mapping to the Sentry `android` project under the release name the app sends (`app.fivvi.pro@<version>+<build>`). **While the release build is not minified there is no mapping: the step is skipped and the log says so.** When minification is turned on, that change must also give the app the mapping's UUID (what the Sentry Gradle plugin does; the repo does not use the plugin), or the mapping will not match a crash.
5. Publishes the bundle to the Play **internal testing** track with `scripts/play-publish.mjs`, a small script against the Play Developer API (a token from the service-account key, one edit: upload, set the track to a completed release of this version code, commit; it refuses a bundle whose version code is not the run's and discards the edit on any failure). Testers get it from the Play Store, usually within minutes after Google has processed it. The keystore is deleted at the end, whatever failed.

**Inputs of a run.** *Release the iOS app*, *Release the Android app* and *Publish the Android bundle to Play internal testing* (all on by default). With *Publish* off, the Android job still signs the bundle and keeps it as an artifact but does not touch Google Play: that is the run for the first upload by hand, and it needs no Play service account yet. The suites of both platforms run whatever the inputs say.

**Version and build number.** Both apps read the version from one committed file, `apps/Version.xcconfig` (`0.1.0` for now). The build number is the number of the run (`github.run_number`) plus a fixed offset (100, in `scripts/release.sh`, above any build uploaded by hand), computed once by **Prepare** and used by every platform of the run, so a bug report says the same number on iPhone and Android. Every run's number is higher than any earlier run's. A re-run of a run (*Re-run jobs*) is refused, because it keeps the run number and could repeat a number that was already uploaded: start a new run instead, which takes the next number (§5, §6). Debug builds and CI test builds keep build number 1.

## 4. Adding testers (the owner)

- **iOS, internal testing:** add the person as a user in App Store Connect (*Users and Access*, role *Developer* or *Marketing* is enough), then add them to the internal group in TestFlight. Internal testers are limited to App Store Connect team members, and builds reach them without a review.
- **iOS, external testing** (testers outside the team, such as pilot trainers): needs *Beta App Review* of the first build, and with it a privacy policy URL and a demo account (§9). It is decided before the first pilot trainer joins ([spec decision 2](https://github.com/fivvi-app/fivvi/issues/169)).
- **Android:** add the email addresses to the internal testers list in Play Console (*Testing › Internal testing › Testers*), then send them the opt-in link. They must be signed in to the Play Store with that address.

Testers use production builds. Until pilot setup production has no data, and only allow-listed addresses can sign in ([F001](../product/FEATURES.md)).

## 5. Shipping a fix

A fix is a new run. Merge the change to `main`, start the lane, approve it, and testers receive a build with a higher number. There is nothing to patch on a phone and no way to push a change to an installed app. Until the new build reaches them, the trainer web app in the phone's browser is the fallback.

## 6. When an upload is rejected

Look at the error in the run's log first, then at App Store Connect (*TestFlight › the build*) or Play Console (*Release › the track*).

| Symptom | Cause | What to do |
|---|---|---|
| The lane fails at signing | Certificate or profile expired, or the profile doesn't match the bundle ID | Renew in Apple's developer site and run `release-secrets.sh ios` again; re-run the lane |
| App Store Connect: *bundle version already used* or Play: *version code already used* | A build number that isn't higher than an earlier upload | Start a new run: every run gets a higher number (a re-run of a run is refused for this reason). If a build was uploaded by hand with a higher number, the offset in `scripts/release.sh` has to be raised (a PR). Renaming or replacing `release.yml` restarts the run number at 1, so raise the offset in the same PR |
| The run stops in its first step: *a release run starts from main* or *attempt 2 of the run* | The run was started from another branch, or is a re-run | Start a new run from `main` |
| The run stops after the tests, before *iOS release* | A native suite failed (the run says which) | Fix it on `main` and start a new run; the test results of the iOS suite are an artifact of the run |
| *The provisioning profile is for … not for …* or *a development or ad hoc profile* | The profile in `IOS_PROVISIONING_PROFILE` is not an App Store profile for `app.fivvi.pro` | Create the right one in Apple's developer site and run `release-secrets.sh ios` again |
| Signing fails with *no identity* or the import fails | The certificate is not an Apple Distribution certificate, or its password is wrong | Export the certificate again as a `.p12` and run `release-secrets.sh ios` again |
| The export fails with an account, login or *no accounts* error | `xcodebuild -exportArchive` could not sign or fetch what it needs with the API key alone | Add `-allowProvisioningUpdates` to the export in `scripts/release-ios.sh` (a PR). It lets Xcode create or update profiles with the API key, so the key then needs the *Admin* role; the lane leaves it out so *App Manager* is enough |
| Authentication or `401` from the App Store Connect or Play API | A wrong or revoked API key, or a role that is too small (the App Store Connect key needs *App Manager*; the Play service account needs release rights for this app) | Fix it in the console and run the matching `release-secrets.sh` command again |
| Play: *you must upload the first bundle manually*, or the publish step fails with `404` | Google's API can't create an app's first release | Start a run with *Publish* off, download the **android-app-bundle** artifact and upload it by hand once (§8 Google) |
| The publish step fails with `403`, or Play says the app is in draft state or the release must be a draft | The service account lacks release rights for this app, or the app's setup in Play Console is not complete (store listing, declarations), so Play accepts only draft releases | Grant the rights (§8 Google), finish the Play Console setup the console asks for, run again |
| *Play read version code … not … of this run* | The bundle that went up carries another version code than the run's | Nothing was released (the edit is discarded). Start a new run; if it repeats, the Gradle `fivvi.buildNumber` wiring is broken (`pnpm test:android`) |
| The Android job stops at the keystore: *does not open* or *has no key with the alias* | A wrong password or alias in the secrets, or a keystore that is not the upload keystore | Run `release-secrets.sh android` (or `android-keystore`) again |
| Apple holds the build for export compliance | The `ITSAppUsesNonExemptEncryption` key is missing from `apps/ios/Config/Info.plist` (a change removed it) | Restore it (`pnpm test:ios` flags it) |
| Beta App Review or Play review rejects the build | Missing privacy policy, demo account or declarations (§9) | Deliver the missing item, answer the reviewer, upload a new build if the app has to change |
| Crashes show unsymbolicated in Sentry | The symbol upload failed or the release name differs | Check the run's Sentry step (a `403` means the token lacks a scope: use an organisation auth token, which carries `org:ci`: releases and debug files; a project or user token fails here) |

A rejected or broken upload never changes what testers already have. Never reuse a build number by hand to "replace" a build.

## 7. Costs

| Step | Cost | Who decides |
|---|---|---|
| Apple Developer Program (company membership) | Verified in [#148](https://github.com/fivvi-app/fivvi/issues/148) (organization membership, active); renewal depends on it | Owner |
| **Google Play Console enrollment** | **One-off US$25**, only if no verified account exists yet (the cost is stated in [spec #169](https://github.com/fivvi-app/fivvi/issues/169); [`ROADMAP.md §12`](../product/ROADMAP.md) has the distribution cost lines) | **Owner approves the spend before anything is enrolled** |
| GitHub Actions on the public repo (macOS included), TestFlight, Play internal testing, Sentry free plan | Free | |

## 8. Owner checklist

Only the owner does these. Agents never do them or ask for the secrets. Each step says what it unlocks.

**Apple**

| | Step | Unlocks |
|---|---|---|
| ☑ | Confirm the company Apple Developer Program membership is active and paid up, and that you are its Account Holder or Admin (#148) | Everything on iOS; an expired membership blocks every release |
| ☑ | Register the bundle ID `app.fivvi.pro` and create the app in App Store Connect: name *Fivvi Pro* (check that it is free), primary language Dutch, an SKU ([#148](https://github.com/fivvi-app/fivvi/issues/148)) | The identifier can't change after the first upload; the store name |
| ☑ | Accept any pending agreements in App Store Connect (the free-apps agreement is enough) (#148) | Uploads and TestFlight |
| ☐ | Create the Apple Distribution certificate and the App Store provisioning profile for the bundle ID | Signing in the iOS lane |
| ☐ | Create an App Store Connect API key with the *App Manager* role (not *Admin*) | The upload from the lane |
| ☐ | Run `scripts/release-secrets.sh ios` | The iOS lane can sign and upload |
| ☐ | Add yourself as an internal TestFlight tester (later the pilot trainers, §4) | Installing on your iPhone |

**Google**

| | Step | Unlocks |
|---|---|---|
| ☐ | Confirm whether a Google Play Console developer account exists and is verified. If not, enroll: **US$25 once, your approval as spend**. An organization account needs a D-U-N-S number; a personal account adds Play's closed-test rule before the public release (§9) | Everything on Android |
| ☐ | Create the app in Play Console: name *Fivvi Pro* (check that it is free), default language Dutch, free, an app, not a game ([#149](https://github.com/fivvi-app/fivvi/issues/149)) | The application ID and the store name |
| ☐ | Run `scripts/release-secrets.sh android-keystore`; back up the keystore and its password; enroll in Play App Signing | The upload key the lane signs with |
| ☐ | Upload the first App Bundle by hand in Play Console. Google's API can't create an app's first release. Start the **Release** workflow with *Publish the Android bundle* switched off, approve it, download the **android-app-bundle** artifact (signed with the upload key; it holds no secret) and upload it to the internal testing track | Every later release through the API |
| ☐ | Create a Google Cloud service account, grant it release rights for this app in Play Console, download its JSON key, run `scripts/release-secrets.sh play` | The lane can publish to the internal testing track |
| ☐ | Create the internal testers list (email addresses) in Play Console | Installing from the internal-test link (§4) |

**GitHub and Sentry**

| | Step | Unlocks |
|---|---|---|
| ☐ | `scripts/github-settings.sh apply` | The `release` environment with your approval and `main`-only deployments |
| ☐ | Create a Sentry organisation auth token for symbol uploads (`org:ci`: releases and debug files; it carries the organisation and the region, which `sentry-cli` needs here), run `scripts/release-secrets.sh sentry` | Symbolicated crashes from tester builds |

## 9. Store requirements for the public release

Public App Store and Google Play listings are **not needed for go-live**; pilot trainers use TestFlight and Play internal testing ([`ROADMAP.md`](../product/ROADMAP.md) M8, M9). They are recorded here so later specs can plan for them. *Internal* is internal TestFlight and Play internal testing; *external* is external TestFlight (Beta App Review); *public* is the App Store and Play production listing. The stores change their rules: check the current store documentation when you reach a step.

| Requirement | Needed | Delivered by | Notes |
|---|---|---|---|
| **In-app account deletion** (Apple requires it for apps with account creation) | Public | Feature: [E014](../product/FEATURES.md) Privacy tooling, shown in *Profiel* ([TM-04](../design/information-architecture.md#51-structure), [IA §5.1](../design/information-architecture.md#51-structure)); not yet specified as tickets | The data side is [`retention-policy.md`](../legal/retention-policy.md) |
| **Google Play's web deletion link** (a URL where a user can ask for deletion without the app) | Public | Owner publishes a page; the request itself is handled by [E014](../product/FEATURES.md). No feature delivers the page yet: needs a spec before the public release | Entered in Play's data safety form |
| **App Store privacy details** ("nutrition label") | External (when App Store Connect asks) and public | Owner fills the form, matching [`docs/legal`](../legal/README.md) ([`sub-processors.md`](../legal/sub-processors.md), [`dpia-assessment.md`](../legal/dpia-assessment.md)); a spec for the app's data collection ([E014](../product/FEATURES.md) and the features that add data) keeps it true | What we tell Apple, Google and users must be the same |
| **Google Play data safety form** | Closed, open and production tracks; not internal testing | Owner, same sources and rule as the privacy details | Declared collection, sharing, encryption and deletion must match the app |
| **Privacy policy URL** | External and public | Owner publishes [`privacy-policy.nl.md`](../legal/privacy-policy.nl.md) and [`.en.md`](../legal/privacy-policy.en.md) (drafts; legal review and publication are open, [`ROADMAP.md`](../product/ROADMAP.md) §4.4) at a public address | Apple asks for it in the TestFlight test information and for the listing; Play asks for it in the app content declarations |
| **A demo account for App Review and Beta App Review** | External and public | Owner, with a decision: sign-in is by emailed code only and sign-up is closed ([F001](../product/FEATURES.md), [ADR-007](../decisions/ADR-007-authentication.md)). Options: a review mailbox whose codes the owner relays (they expire in 15 minutes), or a fixed code for one demo address in production only, which needs a new ADR. [Open question 3 of #169](https://github.com/fivvi-app/fivvi/issues/169) | Not needed for internal testing |
| **Age rating (Apple) and content rating (Google's questionnaire)** | Public (Apple asks before the first App Review submission; Play before the app can go to production) | Owner answers the questionnaires | |
| **Screenshots and listing texts in NL and EN** | Public. Earlier: TestFlight's *What to test* and Play's short description, minimal, in both languages | Listing: **open**, no spec plans the listings yet; the owner asks for one before the public release. Minimal texts: **open**, no ticket of #169 delivers them; the owner decides before the public release whether they become a ticket (strings would go in `packages/i18n`) | Screenshots use synthetic data only |
| **Play's target-API-level rule** (new apps and updates must target a recent Android API level, raised each year) | Every upload to the Play Console; check the deadline there each year | Android build configuration. **Open**: no ticket of #169 checks it; the owner decides before the public release whether a check becomes a ticket, and whoever bumps the SDK yearly keeps it | A build below the required level is rejected |
| **Play's closed-test rule for new personal developer accounts** (a closed test with a minimum number of testers for a minimum number of days before production access) | Public, only when the account is a personal one | Owner: run the closed test with the pilot trainers or the internal alpha testers in time. An organization account is exempt | Check the current numbers in Play Console. Decide personal or organization account before enrolling (§8) |

Related: [`TESTING.md §7`](TESTING.md#7-where-tests-run) (the full native suite before every release), [`ENVIRONMENTS.md`](ENVIRONMENTS.md) (the production address), [`OBSERVABILITY.md`](OBSERVABILITY.md) (Sentry and the release name), [`docs/agents/tools.md`](../agents/tools.md#what-needs-the-owner) (what stays with the owner).
