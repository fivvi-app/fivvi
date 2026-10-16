# Trainer Hub for Android

The native Android app (E008, ADR-003): Kotlin, Jetpack Compose and Material 3, Android 8.0 (API 26) and up. For now it has one screen, Hello, which is the template for every later screen.

## Run it

```bash
scripts/bootstrap.sh --mobile   # once: JDK, Android SDK, the `trainer-hub` emulator, Maestro
pnpm test:android               # what CI runs: ktlint, build, unit tests, Compose UI tests on the emulator
pnpm test:maestro               # the local stack + e2e/maestro flows on the emulator, in nl-NL and en
scripts/android.sh emulator     # boot the emulator and leave it running for repeated runs
```

The scripts give the emulator `EMULATOR_BOOT_TIMEOUT` seconds to boot (default 300). If it exits or doesn't boot in time, they fail with the end of `build/emulator.log` and the emulator's acceleration check.

To try the app against your local web server (`pnpm dev`, port 3000), run `./gradlew installDebug` from this folder with the emulator running. Commands are in `TESTING.md §7.1`.

## Layout

| Path | What |
|---|---|
| `app/` | The app. `hello/` holds the screen: `HelloViewModel` (states `Loading`, `Loaded`, `Failed`) and `HelloScreen`; `theme/` holds `TrainerHubTheme` |
| `api/` | Compiles the generated Kotlin client in `packages/contract/kotlin/generated` in place (Retrofit, OkHttp, kotlinx.serialization). Never edit it here |
| `design-tokens/` | Compiles the generated Kotlin design tokens in `packages/design-tokens/kotlin/generated` in place (package `nl.trainerhub.designtokens`). Never edit them here |
| `lint/` | ktlint rules (`trainer-hub:no-literal-text`, `trainer-hub:no-colour-literal`) and `fixtures/` that prove them |
| `gradle/libs.versions.toml` | Every dependency version |

## Rules

- **Strings** come only from `packages/i18n`: the app's resources include `packages/i18n/generated/android` in place (`values/` is nl-NL, `values-en/` English). The app label is `app.name`. `ktlintCheck` fails on a string literal in a Compose `Text` and names the file and line.
- **Language** (ADR-017, spec #34): the OS per-app language (API 33+, offered for `nl` and `en` by `res/xml/locales_config.xml`), else the first supported device language in order, else English. `MainActivity` applies it to the resources and the view model sends it to the API. Android's own resource match is never the input: the default resources are Dutch.
- **API** through the generated `nl.trainerhub.api` client only. The view model depends on the generated `HelloApi` interface, which tests replace with `FakeHelloApi` (`app/src/testShared`).
- **Base URL** per build type, from `gradle.properties`: debug `trainerhub.apiBaseUrl` (the local server as `10.0.2.2` from the emulator; override with `-Ptrainerhub.apiBaseUrl=https://<preview>/api/`), release `trainerhub.releaseApiBaseUrl` (HTTPS only, or the release build fails). Plain HTTP is allowed only in debug (`src/debug`, network security config).
- **Test tags** are shared with the iOS accessibility identifiers and the Maestro flows: `hello.greeting`, `hello.loading`, `hello.error`, `hello.retry` (`HelloTags`). The app exposes them as resource ids, so Maestro finds them.
- **Theme** (ADR-015): wrap screens in `TrainerHubTheme`. It takes the generated `LightColorScheme` or `DarkColorScheme` as the system's mode is, and `TokenShapes`; text keeps Material 3's type scale in Roboto, so use `MaterialTheme.typography` with the token names (`title1`, `body`), never a font size. No dynamic colour (Material You). Colours come from `MaterialTheme.colorScheme`; for what Material doesn't cover (sessions, status), from `LightTokenColors` or `DarkTokenColors` for the same mode. No screen needs those yet: the first one adds them to `TrainerHubTheme`, so screens don't each pick the mode. Spacing comes from `Spacing`. `ktlintCheck` fails on a hard-coded colour (`Color(…)`, `Color.Red`, `colorResource`, Material's own or dynamic colour schemes) and names the file and line.

## Behind a company proxy

Some TLS-inspecting proxies (e.g. Zscaler) break Java downloads. The scripts handle the two cases seen so far:

- Java doesn't trust the proxy's CA: on macOS, `scripts/_android.sh` builds `~/.config/trainer-hub/java-cacerts` from the JDK's CAs plus the System keychain and sets `JAVA_TOOL_OPTIONS` for its own commands. Run Gradle through the scripts, or set the same option yourself.
- The proxy blocks jars on `repo.maven.apache.org`: `settings.gradle.kts` uses Maven Central's `repo1.maven.org` host instead.
