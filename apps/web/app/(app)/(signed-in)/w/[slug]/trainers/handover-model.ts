import type { FutureSessions, Handover, HandoverDone } from './remove-team-member-client';

/** The select value of *Niemand*: the sessions are cancelled (private) or get *Trainer nodig* (classes). */
export const NOBODY = 'none';

/** What the next 2 weeks hold: the kinds that need a choice. */
export type Window = FutureSessions['nextTwoWeeks'];

/** What the person chose in the two selects (`''` is not chosen yet, `NOBODY` is *Niemand*) and the notify box. */
export interface HandoverValues {
  privateTo: string;
  classesTo: string;
  notifyClients: boolean;
}

const BOTH: Window = { privateSessions: 1, classDates: 1 };

const targetOf = (value: string) => (value === NOBODY ? null : value);

/** Whether every kind the next 2 weeks hold has a choice: a kind with nothing coming needs none. */
export function canHandOver(
  { privateTo, classesTo }: Pick<HandoverValues, 'privateTo' | 'classesTo'>,
  window: Window = BOTH,
): boolean {
  return (
    (window.privateSessions === 0 || privateTo !== '') &&
    (window.classDates === 0 || classesTo !== '')
  );
}

/** The request body of the choices, or `undefined` while one is still to make (F023 AC9, AC9a). */
export function handoverOf(values: HandoverValues, window: Window = BOTH): Handover | undefined {
  if (!canHandOver(values, window)) return undefined;
  return {
    privateTo: window.privateSessions === 0 ? null : targetOf(values.privateTo),
    classesTo: window.classDates === 0 ? null : targetOf(values.classesTo),
    notifyClients: values.notifyClients,
  };
}

/**
 * How many sessions and classes went to someone or got *Trainer nodig* (the done text): the cancelled
 * private sessions are not counted, they have a line of their own.
 */
export function handedOverCount({ nextTwoWeeks, later }: HandoverDone): number {
  return (
    nextTwoWeeks.privateHandedOver +
    nextTwoWeeks.classesHandedOver +
    nextTwoWeeks.classesTrainerNeeded +
    later.privateTrainerNeeded +
    later.classesTrainerNeeded
  );
}
