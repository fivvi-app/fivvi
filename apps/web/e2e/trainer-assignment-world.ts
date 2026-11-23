import { formattingLocales, type Locale, type Messages, trainerWordForms } from '@fivvi/i18n';
import type { APIRequestContext, Page } from '@playwright/test';
import { createTranslator } from 'next-intl';
import {
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect } from './fixtures';
import { waitForEmails } from './lettermint';

// F023 (spec #459, tickets #539 and #541): what the specs of CO-02 and of the calendar's entry points share. CO-02 *Trainer toewijzen* / *Trainer vervangen* on a class date
// (CO-01) and *Trainer wijzigen* on a private session, with the double-booking warning (PS-07),
// the conflict hints, the notify box and what a Trainer cannot do. Copy comes from the catalogs.
// John owns John's Gym and trains there; Sarah, Tom and Mike are its Trainers; Sarah is also the
// Owner of "Sarah Personal Training". Mark Jansen and Anna de Vries are clients. Dates are relative
// to the day the spec runs: Thursday (Boxing, no trainer) and Tuesday (Kracht, weekly, Sarah) within
// the 14 days *Aandacht nodig* looks ahead.
export const GYM = "John's Gym";
export const DAY = 24 * 60 * 60 * 1000;
export const isoDay = (instant: number) => new Date(instant).toISOString().slice(0, 10);
export const shift = (date: string, days: number) =>
  isoDay(Date.parse(`${date}T12:00:00Z`) + days * DAY);

/** The `YYYY-MM-DD` of the first `weekday` (0 is Sunday) at least `minDays` ahead. */
export function ahead(weekday: number, minDays: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + minDays);
  day.setUTCDate(day.getUTCDate() + ((weekday - day.getUTCDay() + 7) % 7));
  return day.toISOString().slice(0, 10);
}
/** Boxing's Thursday and Kracht's first Tuesday. */
export const thursday = () => ahead(4, 3);
export const tuesday = () => ahead(2, 3);

export interface SessionBody {
  id: string;
  version: number;
  status?: string;
  startsAt: string;
  trainer?: { id: string; name: string };
}

export interface World {
  john: string;
  sarah: string;
  tom: string;
  mike: string;
  slug: string;
  workspaceId: string;
  /** The team-member IDs of the trainers, by name. */
  trainer: (name: string) => string;
  base: string;
}

export async function created(request: APIRequestContext, url: string, data: unknown) {
  const response = await request.post(url, { data });
  expect(response.status(), url).toBe(201);
  return response.json();
}

/** John's Gym with Sarah, Tom and Mike on its team (all train), and John signed in. */
export async function team(
  page: Page,
  context: Parameters<typeof signInWithSession>[0],
): Promise<World> {
  const [john, sarah, tom, mike] = [
    newAddress('john'),
    newAddress('sarah'),
    newAddress('tom'),
    newAddress('mike'),
  ];
  await createAccount(john, undefined, 'John');
  await createAccount(sarah, undefined, 'Sarah');
  await createAccount(tom, undefined, 'Tom');
  await createAccount(mike, undefined, 'Mike');
  const slug = await createGymWithTrainer(john, GYM, 'owner');
  await joinTeam(sarah, slug, 'trainer');
  await joinTeam(tom, slug, 'trainer');
  await joinTeam(mike, slug, 'trainer');
  await signInWithSession(context, john);
  await page.goto(`/w/${slug}`);
  const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
    workspaceId: string;
    name: string;
  }[];
  const workspaceId = workspaces.find((workspace) => workspace.name === GYM)?.workspaceId ?? '';
  const base = `/api/v1/workspaces/${workspaceId}`;
  const trainers = (await (await page.request.get(`${base}/trainers`)).json()) as {
    id: string;
    name: string;
  }[];
  const trainer = (name: string) => trainers.find((entry) => entry.name === name)?.id ?? '';
  return { john, sarah, tom, mike, slug, workspaceId, trainer, base };
}

export async function seedClient(
  request: APIRequestContext,
  base: string,
  name: string,
  emailLocale?: 'nl-NL' | 'en',
) {
  return (await created(request, `${base}/clients`, {
    name,
    email: newAddress(name.split(' ')[0]?.toLowerCase() ?? 'client'),
    ...(emailLocale ? { emailLocale } : {}),
  })) as { id: string; name: string; email: string };
}

export async function seedPrivate(
  request: APIRequestContext,
  base: string,
  data: { clientId: string; trainerId: string; localDate: string; localStart: string },
) {
  return (
    (await created(request, `${base}/sessions/private`, {
      durationMinutes: 60,
      notify: false,
      ...data,
    })) as { session: SessionBody }
  ).session;
}

/** Boxing on `thursday()` at 19:15, without a trainer. */
export async function seedBoxing(request: APIRequestContext, base: string) {
  const boxing = (await created(request, `${base}/group-classes`, {
    nameNl: 'Boxing',
    capacity: 8,
    durationMinutes: 60,
    firstDate: { localDate: thursday(), localStart: '19:15' },
  })) as { groupClass: { id: string }; firstDate: { id: string } };
  return { classId: boxing.groupClass.id, sessionId: boxing.firstDate.id };
}

/** Kracht (Strength), weekly on Tuesday 18:00 from `tuesday()` with `trainerId`; its dates, soonest first. */
export async function seedKracht(request: APIRequestContext, base: string, trainerId: string) {
  const kracht = (await created(request, `${base}/group-classes`, {
    nameNl: 'Kracht',
    nameEn: 'Strength',
    capacity: 12,
    durationMinutes: 60,
    trainerId,
  })) as { groupClass: { id: string } };
  await created(request, `${base}/group-classes/${kracht.groupClass.id}/dates`, {
    localDate: tuesday(),
    localStart: '18:00',
    repeat: 'weekly',
  });
  // The calendar answers a week at a time: the first four Tuesdays.
  const dates: { id: string; startsAt: string }[] = [];
  for (const week of [0, 7, 14, 21]) {
    const from = shift(tuesday(), week);
    const answer = (await (
      await request.get(`${base}/calendar?from=${from}&to=${shift(from, 6)}`)
    ).json()) as { items: { id: string; type: string; startsAt: string }[] };
    dates.push(...answer.items.filter((item) => item.type === 'group'));
  }
  return { classId: kracht.groupClass.id, dates: dates.map((date) => date.id) };
}

export async function storedSession(request: APIRequestContext, base: string, id: string) {
  const response = await request.get(`${base}/sessions/${id}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as SessionBody;
}

/** The translators and values every test of a locale uses. */
export function wording(appLocale: Locale, copy: Messages) {
  const word = trainerWordForms('trainer', appLocale);
  const dialog = createTranslator({
    locale: formattingLocales[appLocale],
    messages: copy,
    namespace: 'sessions.trainerDialog',
  });
  const classes = createTranslator({
    locale: formattingLocales[appLocale],
    messages: copy,
    namespace: 'classes',
  });
  const day = (instant: string) =>
    new Intl.DateTimeFormat(formattingLocales[appLocale], {
      timeZone: 'Europe/Amsterdam',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(instant));
  const longDate = (date: string) =>
    new Intl.DateTimeFormat(formattingLocales[appLocale], {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${date}T12:00:00Z`));
  return {
    word,
    t: dialog,
    classes,
    day,
    longDate,
    titleAssign: dialog('titleAssign', { ...word }),
    titleSubstitute: dialog('titleSubstitute', { ...word }),
    titleChange: dialog('titleChange', { ...word }),
    kracht: appLocale === 'en' ? 'Strength' : 'Kracht',
  };
}

/** Waits for the trainer-change email to `address` that names `trainer`: a client's other mail is not it. */
export async function trainerChangeEmail(address: string, trainer: string) {
  let found: Awaited<ReturnType<typeof waitForEmails>>[number] | undefined;
  await expect
    .poll(async () => {
      found = (await waitForEmails(address)).find((email) => email.text.includes(trainer));
      return found !== undefined;
    })
    .toBe(true);
  if (!found) throw new Error('No trainer-change email.');
  return found;
}

/** The `YYYY-MM-DD` `days` days from today (UTC; at least two days keep clear of the day's edge). */
export const inDays = (days: number) => isoDay(Date.now() + days * DAY);

/** A Kracht class with `trainerId` as its trainer and no dates yet. */
export async function seedKrachtClass(request: APIRequestContext, base: string, trainerId: string) {
  return (
    (await created(request, `${base}/group-classes`, {
      nameNl: 'Kracht',
      nameEn: 'Strength',
      capacity: 12,
      durationMinutes: 60,
      trainerId,
    })) as { groupClass: { id: string } }
  ).groupClass.id;
}

/** One date of the class at 18:00, with `trainerId` teaching. */
export async function seedClassDate(
  request: APIRequestContext,
  base: string,
  classId: string,
  localDate: string,
  trainerId: string,
) {
  return (
    (await created(request, `${base}/group-classes/${classId}/dates`, {
      localDate,
      localStart: '18:00',
      trainerId,
    })) as { id: string }
  ).id;
}
