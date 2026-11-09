import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as getAppleAssociation } from '../app/.well-known/apple-app-site-association/route';
import { GET as getAssetLinks } from '../app/.well-known/assetlinks.json/route';
import {
  TEST_ANDROID_CERT_SHA256 as FINGERPRINT,
  TEST_APPLE_TEAM_ID as TEAM_ID,
} from '../e2e/servers';

function configure(env: { APPLE_TEAM_ID?: string; ANDROID_CERT_SHA256?: string }) {
  vi.stubEnv('APPLE_TEAM_ID', env.APPLE_TEAM_ID ?? '');
  vi.stubEnv('ANDROID_CERT_SHA256', env.ANDROID_CERT_SHA256 ?? '');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('E017 AC5: association files for /j and /i only, none on previews', () => {
  describe('with both variables set', () => {
    it('serves the Apple file as JSON for app.fivvi, covering /j/* and /i/* only', async () => {
      configure({ APPLE_TEAM_ID: TEAM_ID, ANDROID_CERT_SHA256: FINGERPRINT });

      const response = getAppleAssociation();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/^application\/json/);
      expect(response.headers.get('location')).toBeNull();
      expect(await response.json()).toEqual({
        applinks: {
          details: [
            { appIDs: [`${TEAM_ID}.app.fivvi`], components: [{ '/': '/j/*' }, { '/': '/i/*' }] },
          ],
        },
      });
    });

    it('serves the Android file as JSON, handing app.fivvi the web links with the fingerprint', async () => {
      configure({ APPLE_TEAM_ID: TEAM_ID, ANDROID_CERT_SHA256: FINGERPRINT });

      const response = getAssetLinks();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/^application\/json/);
      expect(response.headers.get('location')).toBeNull();
      expect(await response.json()).toEqual([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'app.fivvi',
            sha256_cert_fingerprints: [FINGERPRINT],
          },
        },
      ]);
    });

    it('never names Fivvi Pro', async () => {
      configure({ APPLE_TEAM_ID: TEAM_ID, ANDROID_CERT_SHA256: FINGERPRINT });

      const bodies = await Promise.all([getAppleAssociation().text(), getAssetLinks().text()]);

      for (const body of bodies) expect(body).not.toContain('app.fivvi.pro');
    });

    it('writes a fingerprint given in lowercase or without colons as the colon-separated uppercase form', async () => {
      configure({
        ANDROID_CERT_SHA256: FINGERPRINT.replaceAll(':', '').toLowerCase(),
      });

      const [entry] = await getAssetLinks().json();

      expect(entry.target.sha256_cert_fingerprints).toEqual([FINGERPRINT]);
    });
  });

  describe('without the variables (previews, development)', () => {
    it.each([
      ['unset', undefined],
      ['empty', ''],
      ['blank', '  '],
    ])('answers 404 for both files when they are %s', (_label, value) => {
      configure({ APPLE_TEAM_ID: value, ANDROID_CERT_SHA256: value });

      expect(getAppleAssociation().status).toBe(404);
      expect(getAssetLinks().status).toBe(404);
    });

    it('answers 404 for the file whose variable is missing and serves the other', () => {
      configure({ APPLE_TEAM_ID: TEAM_ID });

      expect(getAppleAssociation().status).toBe(200);
      expect(getAssetLinks().status).toBe(404);
    });
  });

  describe('a malformed value', () => {
    it('fails with the variable name and never its value, so a typo is not served', () => {
      configure({ APPLE_TEAM_ID: 'not a team id', ANDROID_CERT_SHA256: 'AB:CD' });

      expect(() => getAppleAssociation()).toThrow(/APPLE_TEAM_ID/);
      expect(() => getAssetLinks()).toThrow(/ANDROID_CERT_SHA256/);
      for (const get of [getAppleAssociation, getAssetLinks]) {
        expect(() => get()).not.toThrow(/not a team id|AB:CD/);
      }
    });
  });
});
