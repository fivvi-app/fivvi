/**
 * The sample booking of the home page (F064 AC3): Lisa books a class, confirms it, and the trainer
 * marks her attendance, and each step moves the credits and the story on the page. It is a story
 * told in the browser: no request leaves the page and nothing is stored.
 */
export type SampleStep = 'idle' | 'confirming' | 'booked' | 'attended';
export type SampleAction = 'book' | 'confirm' | 'back' | 'attend' | 'again';

/** What a step does, as `[from, action] → to`; any other action leaves the step as it is. */
const transitions: Partial<Record<SampleStep, Partial<Record<SampleAction, SampleStep>>>> = {
  idle: { book: 'confirming' },
  confirming: { confirm: 'booked', back: 'idle' },
  booked: { attend: 'attended' },
  attended: { again: 'idle' },
};

export function sampleTransition(step: SampleStep, action: SampleAction): SampleStep {
  return transitions[step]?.[action] ?? step;
}

/** Lisa's credit pack holds 10 group credits; 3 are used before the story starts. */
const PACK = 10;
const USED_AT_START = 3;

export interface SampleBalance {
  used: number;
  planned: number;
  left: number;
}

/** The credits at a step. The booking plans one credit once confirmed; attendance uses it. */
export function sampleBalance(step: SampleStep): SampleBalance {
  const used = USED_AT_START + (step === 'attended' ? 1 : 0);
  const planned = step === 'booked' ? 1 : 0;
  return { used, planned, left: PACK - used - planned };
}

/** The six steps of the story, in order: each is a title and a line in the catalog. */
export const CHAIN_STEPS = [
  'pack',
  'payment',
  'invoice',
  'booking',
  'attendance',
  'balance',
] as const;
export type ChainStep = (typeof CHAIN_STEPS)[number];

export type ChainStatus = 'done' | 'live' | 'todo';

/** Whether a step of the story is done, the one in progress, or still to come. */
export function sampleStatus(step: SampleStep, id: ChainStep): ChainStatus {
  switch (id) {
    case 'pack':
    case 'payment':
    case 'invoice':
      return 'done';
    case 'booking':
      return step === 'confirming'
        ? 'live'
        : step === 'booked' || step === 'attended'
          ? 'done'
          : 'todo';
    case 'attendance':
      return step === 'booked' ? 'live' : step === 'attended' ? 'done' : 'todo';
    case 'balance':
      return step === 'attended' ? 'done' : 'todo';
  }
}
