/**
 * The two files that let the join link (`/j/{code}`) and the invitation link (`/i/{token}`) open
 * the client app Fivvi instead of the web (E017 AC5, owner decision of 4 November 2026):
 * Universal Links on iOS read `apple-app-site-association`, verified App Links on Android read
 * `assetlinks.json`. They name `app.fivvi` only: Fivvi Pro claims no paths.
 *
 * Each file needs one value from the environment, set for production only. An environment
 * without it (a preview, development) serves no file, so its links open the web. A value that is
 * set but malformed throws, naming the variable and never its value: a typo is a failed request
 * that is reported, not a file that quietly never verifies.
 */

/** The client app's bundle ID on iOS and application ID on Android. */
export const CLIENT_APP_ID = 'app.fivvi';

/** The only paths the client app claims. */
const LINK_PATHS = ['/j/*', '/i/*'] as const;

const TEAM_ID = /^[A-Z0-9]{10}$/;
const SHA256_HEX = /^[0-9A-F]{64}$/;

/** The value of `name`, trimmed; `undefined` when it is unset, empty or blank. */
function readVariable(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * The Apple association file, or `undefined` without `APPLE_TEAM_ID` (the 10-character team ID
 * of the Apple Developer account).
 */
export function appleAppSiteAssociation(env: NodeJS.ProcessEnv = process.env) {
  const teamId = readVariable(env, 'APPLE_TEAM_ID');
  if (teamId === undefined) return undefined;
  if (!TEAM_ID.test(teamId)) throw new Error('APPLE_TEAM_ID is not a 10-character Apple team ID');
  return {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${CLIENT_APP_ID}`],
          components: LINK_PATHS.map((path) => ({ '/': path })),
        },
      ],
    },
  };
}

/**
 * The Android asset links file, or `undefined` without `ANDROID_CERT_SHA256` (the SHA-256
 * fingerprint of the Play app-signing certificate, hex bytes with or without colons).
 */
export function androidAssetLinks(env: NodeJS.ProcessEnv = process.env) {
  const raw = readVariable(env, 'ANDROID_CERT_SHA256');
  if (raw === undefined) return undefined;
  const hex = raw.replaceAll(':', '').toUpperCase();
  if (!SHA256_HEX.test(hex)) {
    throw new Error('ANDROID_CERT_SHA256 is not a SHA-256 fingerprint of 32 bytes in hex');
  }
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: CLIENT_APP_ID,
        sha256_cert_fingerprints: [hex.match(/../g)?.join(':')],
      },
    },
  ];
}

/** The answer for a file: 200 JSON, or 404 without its configuration. */
export function associationResponse(file: object | undefined): Response {
  // Not `Response.json`, whose content type has no charset; plain `application/json` is what
  // Apple's and Google's fetchers expect, and they follow no redirect.
  return file === undefined
    ? new Response(null, { status: 404 })
    : new Response(JSON.stringify(file), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
}
