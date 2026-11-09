import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('E002 next.config', () => {
  // `next dev` writes apps/web/AGENTS.md and CLAUDE.md (the Next.js agent rules) whenever it
  // detects an AI coding agent; they are untracked, so the PR flow refuses to continue (#236).
  it('turns off the generated Next.js agent-rules files', () => {
    expect(nextConfig.agentRules).toBe(false);
  });
});

describe('F064 next.config', () => {
  // The app and the site have a root layout each, so an address that matches nothing has no layout
  // to show the 404 in (`app/global-not-found.tsx`).
  it('turns on the global 404 page', () => {
    expect(nextConfig.experimental?.globalNotFound).toBe(true);
  });
});
