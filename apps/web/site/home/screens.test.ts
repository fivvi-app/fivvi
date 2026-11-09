import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { audienceIds, audiences } from './audiences';
import {
  SCENES,
  type SceneId,
  SHOT_IDS,
  sceneAvifSources,
  sceneSources,
  shotSources,
  shots,
  shotWidths,
} from './screens';

const publicDir = path.resolve(import.meta.dirname, '../../public');
const fileOf = (url: string) => path.join(publicDir, url);

// F064 AC3: the screens and miniatures the home page serves must exist, in both languages, light
// and dark, so no image on the page is broken. publish-shots.cjs makes the files.
describe('F064 the home page’s screens and miniatures', () => {
  it('has every screen in every language, mode and size', () => {
    const missing: string[] = [];
    for (const id of SHOT_IDS) {
      for (const lang of ['nl', 'en'] as const) {
        for (const mode of ['light', 'dark'] as const) {
          for (const width of shotWidths(id)) {
            const url = shotSources(id, lang)[mode].find((source) => source.width === width)?.url;
            if (!url || !existsSync(fileOf(url))) missing.push(`${id} ${lang} ${mode} ${width}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('has every miniature in both sizes', () => {
    for (const id of Object.keys(SCENES) as SceneId[]) {
      const sources = sceneSources(id);
      expect(sources).toHaveLength(2);
      for (const { url } of sources) expect(existsSync(fileOf(url)), url).toBe(true);
    }
  });

  // F064 AC15: modern formats per screen size. The miniature is the largest picture on a phone's
  // first screen, so it is AVIF in three sizes, with WebP in two for browsers that lack AVIF.
  it('has every miniature as AVIF in three sizes, smaller than its WebP of the same width', () => {
    for (const id of Object.keys(SCENES) as SceneId[]) {
      const sources = sceneAvifSources(id);
      expect(sources.map(({ width }) => width)).toEqual([400, 600, 800]);
      for (const { url } of sources) {
        expect(url).toMatch(/\.avif$/);
        expect(existsSync(fileOf(url)), url).toBe(true);
      }
      const avif800 = statSync(fileOf(sources[2]?.url ?? '')).size;
      const webp800 = statSync(fileOf(sceneSources(id)[1]?.url ?? '')).size;
      expect(avif800).toBeLessThan(webp800);
    }
  });

  it('describes every screen in the catalogs, in both languages', () => {
    for (const locale of locales) {
      for (const id of SHOT_IDS) {
        expect(messages[locale].site.home.screens[shots[id].alt].length).toBeGreaterThan(10);
      }
    }
  });

  it('shows each audience with a miniature and screens that exist', () => {
    expect(audienceIds).toEqual(['gym', 'studio', 'pt', 'client']);
    for (const id of audienceIds) {
      const { stage, scene } = audiences[id];
      expect(Object.keys(SCENES)).toContain(scene);
      const used = stage.kind === 'mix' ? [stage.web, stage.phone] : stage.phones;
      for (const shot of used) expect(SHOT_IDS).toContain(shot);
    }
  });

  it('puts a laptop screen with one phone, or three phones in a row', () => {
    for (const id of audienceIds) {
      const { stage } = audiences[id];
      if (stage.kind === 'mix') {
        expect(shots[stage.web].device).toBe('browser');
        expect(shots[stage.phone].device).not.toBe('browser');
      } else {
        expect(stage.phones).toHaveLength(3);
        for (const phone of stage.phones) expect(shots[phone].device).not.toBe('browser');
      }
    }
  });
});
