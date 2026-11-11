import { describe, expect, it } from 'vitest';
import { TRAINER_WORDS } from './trainer-word.ts';

describe('F068 the workspace’s word for its trainers', () => {
  it('offers exactly trainer, instructeur, docent and coach, in that order', () => {
    expect(TRAINER_WORDS).toEqual(['trainer', 'instructeur', 'docent', 'coach']);
  });
});
