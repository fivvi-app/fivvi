import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAINER_WORD, isTrainerWord, TRAINER_WORDS } from './trainer-word.ts';

describe('F068 the workspace’s word for its trainers', () => {
  it('offers exactly trainer, instructeur, docent and coach, in that order', () => {
    expect(TRAINER_WORDS).toEqual(['trainer', 'instructeur', 'docent', 'coach']);
  });

  it('starts on trainer', () => {
    expect(DEFAULT_TRAINER_WORD).toBe('trainer');
  });

  it('recognises the four choices and nothing else', () => {
    for (const word of TRAINER_WORDS) expect(isTrainerWord(word)).toBe(true);
    for (const other of ['instructor', 'Trainer', '', 'teacher', undefined, null, 4]) {
      expect(isTrainerWord(other)).toBe(false);
    }
  });
});
