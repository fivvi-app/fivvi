import { describe, expect, it } from 'vitest';
import {
  CHAIN_STEPS,
  type SampleStep,
  sampleBalance,
  sampleStatus,
  sampleTransition,
} from './sample-booking';

// F064 AC3: the sample booking on the home page. It is a story told on the page: nothing here
// reads or writes anything outside it.
describe('F064 AC3 the sample booking', () => {
  it('starts with Lisa’s 7 group credits and nothing planned', () => {
    expect(sampleBalance('idle')).toEqual({ used: 3, planned: 0, left: 7 });
  });

  it('asks for confirmation before it books: the balance does not change until she confirms', () => {
    expect(sampleTransition('idle', 'book')).toBe('confirming');
    expect(sampleBalance('confirming')).toEqual(sampleBalance('idle'));
  });

  it('confirming plans one credit; marking attendance uses it, and the total stays 10', () => {
    expect(sampleTransition('confirming', 'confirm')).toBe('booked');
    expect(sampleBalance('booked')).toEqual({ used: 3, planned: 1, left: 6 });
    expect(sampleTransition('booked', 'attend')).toBe('attended');
    expect(sampleBalance('attended')).toEqual({ used: 4, planned: 0, left: 6 });
    for (const step of ['idle', 'confirming', 'booked', 'attended'] as const) {
      const { used, planned, left } = sampleBalance(step);
      expect(used + planned + left).toBe(10);
    }
  });

  it('going back from the confirmation, or once more at the end, starts again', () => {
    expect(sampleTransition('confirming', 'back')).toBe('idle');
    expect(sampleTransition('attended', 'again')).toBe('idle');
  });

  it('ignores an action that does not belong to the step', () => {
    const steps: SampleStep[] = ['idle', 'confirming', 'booked', 'attended'];
    expect(sampleTransition('idle', 'confirm')).toBe('idle');
    expect(sampleTransition('idle', 'attend')).toBe('idle');
    expect(sampleTransition('booked', 'book')).toBe('booked');
    expect(sampleTransition('booked', 'back')).toBe('booked');
    expect(sampleTransition('attended', 'confirm')).toBe('attended');
    for (const step of steps)
      expect(sampleTransition(step, 'again')).toBe(step === 'attended' ? 'idle' : step);
  });

  it('marks the payment and the invoice done from the start, and the rest as the booking moves on', () => {
    const status = (step: SampleStep) => CHAIN_STEPS.map((id) => sampleStatus(step, id));
    expect(status('idle')).toEqual(['done', 'done', 'done', 'todo', 'todo', 'todo']);
    expect(status('confirming')).toEqual(['done', 'done', 'done', 'live', 'todo', 'todo']);
    expect(status('booked')).toEqual(['done', 'done', 'done', 'done', 'live', 'todo']);
    expect(status('attended')).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
  });

  it('names the six steps in the order of the story', () => {
    expect(CHAIN_STEPS).toEqual(['pack', 'payment', 'invoice', 'booking', 'attendance', 'balance']);
  });
});
