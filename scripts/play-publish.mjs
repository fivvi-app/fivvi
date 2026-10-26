#!/usr/bin/env node
// Publishes an App Bundle to the Google Play internal testing track with the Play Developer API (E017 #191,
// docs/engineering/RELEASE.md). A small script with no dependency instead of a Gradle plugin: the maintained plugins
// do not follow the Android Gradle Plugin of this repo, and a new dependency would need the owner's approval.
// scripts/release-android.sh `publish` calls it; scripts/test/release-android.test.mjs runs it against a fake API.
//
//   node scripts/play-publish.mjs <bundle.aab> <application ID> <version code> <release name>
//
// Reads the service-account key (JSON) from PLAY_SERVICE_ACCOUNT_JSON; the key is never printed, nor is the access token.
// PLAY_API_BASE and PLAY_TOKEN_URL replace Google's addresses; only the tests set them.
//
// The steps, all inside one edit: get a token with a signed JWT (OAuth 2.0 for service accounts), upload the bundle, check
// that Play read the version code of this run from it, set the internal track to a completed release of that version
// code, commit. Anything that fails after the edit was opened discards the edit, so nothing half-done reaches testers.
// Google's API can't create an app's first release: the first bundle goes up by hand (RELEASE.md §8).
import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const API_BASE = process.env.PLAY_API_BASE ?? 'https://androidpublisher.googleapis.com';
const TOKEN_URL = process.env.PLAY_TOKEN_URL ?? 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const TRACK = 'internal';

const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

const [bundlePath, applicationId, versionCode, releaseName] = process.argv.slice(2);
if (!bundlePath || !applicationId || !/^[1-9][0-9]*$/.test(versionCode ?? '') || !releaseName) {
  fail('usage: play-publish.mjs <bundle.aab> <application ID> <version code> <release name>');
}

/** The service account from the environment: a JSON object with a client email and a private key. */
const serviceAccount = () => {
  const text = process.env.PLAY_SERVICE_ACCOUNT_JSON ?? '';
  let account;
  try {
    account = JSON.parse(text);
  } catch {
    // Never quote the value: it is a key.
    fail(
      'PLAY_SERVICE_ACCOUNT_JSON is not JSON: set it with scripts/release-secrets.sh play from the key file',
    );
  }
  if (
    typeof account?.client_email !== 'string' ||
    typeof account?.private_key !== 'string' ||
    !account.client_email ||
    !account.private_key
  ) {
    fail(
      'PLAY_SERVICE_ACCOUNT_JSON has no client_email and private_key: is it the key file of a service account?',
    );
  }
  return account;
};

const base64url = (value) => Buffer.from(value).toString('base64url');

/** A signed JWT assertion for the token endpoint, valid for an hour. */
const assertion = (account) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = [
    base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    base64url(
      JSON.stringify({
        iss: account.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    ),
  ].join('.');
  let signature;
  try {
    signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key);
  } catch {
    fail('the private_key of PLAY_SERVICE_ACCOUNT_JSON is not a usable RSA key');
  }
  return `${unsigned}.${base64url(signature)}`;
};

/** What Google says went wrong, from an error body: never more than its message. */
const reason = (text) => {
  try {
    const body = JSON.parse(text);
    const message = body?.error?.message ?? body?.error_description ?? body?.error;
    return typeof message === 'string' ? message : '';
  } catch {
    return '';
  }
};

const call = async (what, method, url, { token, body, headers = {}, timeout = 60_000 } = {}) => {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw new Error(`${what}: no answer (${error.name})`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${what}: HTTP ${response.status} ${reason(text)}`.trim());
  }
  return text ? JSON.parse(text) : {};
};

const publish = async () => {
  const account = serviceAccount();
  const bundle = await readFile(bundlePath).catch(() => fail(`no App Bundle at ${bundlePath}`));

  const { access_token: token } = await call('token', 'POST', TOKEN_URL, {
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertion(account),
    }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  if (!token) throw new Error('token: Google sent no access token');

  const app = `${API_BASE}/androidpublisher/v3/applications/${applicationId}`;
  const { id: edit } = await call('open an edit', 'POST', `${app}/edits`, { token });
  try {
    const uploaded = await call(
      'upload the bundle',
      'POST',
      `${API_BASE}/upload/androidpublisher/v3/applications/${applicationId}/edits/${edit}/bundles?uploadType=media`,
      {
        token,
        body: bundle,
        headers: { 'content-type': 'application/octet-stream' },
        timeout: 600_000,
      },
    ).catch((error) => {
      if (/HTTP (404|403)/.test(error.message)) {
        error.message +=
          " (Google's API can't create the first release of an app: upload the first App Bundle by hand in Play Console, RELEASE.md §8)";
      }
      throw error;
    });
    if (String(uploaded.versionCode) !== versionCode) {
      throw new Error(
        `Play read version code ${uploaded.versionCode} from the bundle, not ${versionCode} of this run: nothing is released`,
      );
    }
    await call('set the internal track', 'PUT', `${app}/edits/${edit}/tracks/internal`, {
      token,
      body: JSON.stringify({
        track: TRACK,
        releases: [{ name: releaseName, versionCodes: [versionCode], status: 'completed' }],
      }),
      headers: { 'content-type': 'application/json' },
    });
    await call('commit the edit', 'POST', `${app}/edits/${edit}:commit`, { token });
  } catch (error) {
    // Best effort: an edit that is not committed expires by itself.
    await call('discard the edit', 'DELETE', `${app}/edits/${edit}`, { token }).catch(() => {});
    throw error;
  }
  console.log(
    `✅ publish: ${applicationId} version code ${versionCode} is on the Play ${TRACK} testing track`,
  );
};

publish().catch((error) => fail(error.message));
