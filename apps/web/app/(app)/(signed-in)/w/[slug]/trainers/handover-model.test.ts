import { describe, expect, it } from 'vitest';
import { canHandOver, handedOverCount, handoverOf } from './handover-model';

const done = {
  nextTwoWeeks: {
    privateHandedOver: 3,
    privateCancelled: 0,
    classesHandedOver: 4,
    classesTrainerNeeded: 0,
  },
  later: { privateTrainerNeeded: 2, classesTrainerNeeded: 6 },
};

describe('F023 TW-06 the handover form', () => {
  it('AC9: a choice is a trainer, Niemand (null) or still to make', () => {
    expect(handoverOf({ privateTo: 'tom', classesTo: 'none', notifyClients: true })).toEqual({
      privateTo: 'tom',
      classesTo: null,
      notifyClients: true,
    });
    expect(handoverOf({ privateTo: '', classesTo: 'none', notifyClients: true })).toBeUndefined();
  });

  it('a kind with nothing in the next 2 weeks needs no choice and is sent as null', () => {
    expect(
      handoverOf(
        { privateTo: '', classesTo: '', notifyClients: false },
        { privateSessions: 0, classDates: 0 },
      ),
    ).toEqual({ privateTo: null, classesTo: null, notifyClients: false });
    expect(
      canHandOver({ privateTo: 'tom', classesTo: '' }, { privateSessions: 3, classDates: 0 }),
    ).toBe(true);
    expect(
      canHandOver({ privateTo: 'tom', classesTo: '' }, { privateSessions: 3, classDates: 4 }),
    ).toBe(false);
  });

  it('AC9: the done text counts the sessions and classes that went to someone or got Trainer nodig, not the cancelled ones', () => {
    expect(handedOverCount(done)).toBe(15);
    expect(
      handedOverCount({
        ...done,
        nextTwoWeeks: { ...done.nextTwoWeeks, privateHandedOver: 0, privateCancelled: 3 },
      }),
    ).toBe(12);
  });
});
