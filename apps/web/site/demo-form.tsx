'use client';

import type { Locale } from '@fivvi/i18n';
import { Label } from '@fivvi/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { Field } from '@fivvi/ui/kit/field';
import { PillButton } from '@fivvi/ui/kit/pill-button';
import type { Route } from 'next';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  type DemoFieldError,
  type DemoRequestInput,
  type DemoRequestResult,
  sendDemoRequest,
} from './demo-request-client';

type BusinessKind = DemoRequestInput['businessKind'];
type TrainerCount = DemoRequestInput['trainerCount'];

/** Every text of the form, worded by the server page from the catalog (`site.demo.*`). */
export interface DemoFormCopy {
  label: string;
  name: string;
  email: string;
  business: string;
  businessOptions: Record<BusinessKind, string>;
  trainers: string;
  trainerOptions: Record<TrainerCount, string>;
  message: string;
  send: string;
  sending: string;
  note: string;
  privacyLink: string;
  sent: string;
  errors: Record<DemoFieldError | 'rateLimited' | 'noConnection' | 'failed', string>;
}

type FieldErrors = Extract<DemoRequestResult, { reason: 'fields' }>['errors'];

/**
 * The demo request form (F064, AC5 and AC6): name, email address, kind of business, number of
 * trainers and an optional message. It posts to the API (`sendDemoRequest`); what the API refuses
 * is worded under the field it names, and a request that was not sent says so, with a way to write
 * to us. The confirmation replaces the form once the API accepted the request. The honeypot is a
 * field people never see; the API drops a request that fills it. The visitor's answers live in
 * this form only: nothing is stored in the browser.
 */
export function DemoForm({
  locale,
  copy,
  privacyHref,
}: {
  locale: Locale;
  copy: DemoFormCopy;
  /** The privacy policy page, or `undefined` while it does not exist. */
  privacyHref?: Route;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<'rateLimited' | 'noConnection' | 'failed' | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  // The button waits for the page to hydrate: a click before that would submit the form natively
  // and reload the page, and a value typed before it would be lost.
  const [ready, setReady] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => setReady(true), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    setPending(true);
    setErrors({});
    setFailure(null);
    const result = await sendDemoRequest({
      name: text('name'),
      email: text('email'),
      businessKind: text('businessKind') as BusinessKind,
      trainerCount: text('trainerCount') as TrainerCount,
      message: text('message'),
      locale,
      website: text('website'),
    });
    setPending(false);
    if (result.ok) return setSent(true);
    if (result.reason === 'fields') {
      // The first field with an error gets the focus, so a keyboard or screen reader user lands
      // on it: the errors are on the page before it is looked for.
      flushSync(() => setErrors(result.errors));
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setFailure(result.reason);
  }

  if (sent) {
    return (
      <p
        role="status"
        className="rounded-card bg-status-success-bg p-5.5 text-[17px] leading-[1.4]"
      >
        {copy.sent}
      </p>
    );
  }

  const fieldError = (error: DemoFieldError | undefined) =>
    error ? copy.errors[error] : undefined;

  return (
    <form
      ref={form}
      noValidate
      aria-label={copy.label}
      onSubmit={submit}
      className="grid gap-3.5 rounded-card bg-card p-[clamp(20px,3vw,30px)]"
    >
      <Field
        label={copy.name}
        name="name"
        type="text"
        autoComplete="name"
        error={fieldError(errors.name)}
      />
      <Field
        label={copy.email}
        name="email"
        type="email"
        autoComplete="email"
        error={fieldError(errors.email)}
      />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="demo-business">{copy.business}</Label>
          <NativeSelect id="demo-business" name="businessKind" className="w-full">
            {(Object.keys(copy.businessOptions) as BusinessKind[]).map((kind) => (
              <NativeSelectOption key={kind} value={kind}>
                {copy.businessOptions[kind]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="demo-trainers">{copy.trainers}</Label>
          <NativeSelect id="demo-trainers" name="trainerCount" className="w-full">
            {(Object.keys(copy.trainerOptions) as TrainerCount[]).map((count) => (
              <NativeSelectOption key={count} value={count}>
                {copy.trainerOptions[count]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="demo-message">{copy.message}</Label>
        <textarea
          id="demo-message"
          name="message"
          rows={3}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? 'demo-message-error' : undefined}
          className="min-h-24 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/18 dark:bg-input/30"
        />
        {errors.message ? (
          <p id="demo-message-error" className="text-[13px] font-semibold text-status-danger-fg">
            {fieldError(errors.message)}
          </p>
        ) : null}
      </div>
      {/* The honeypot: out of sight, out of the tab order, ignored by assistive technology. */}
      <div aria-hidden="true" className="absolute -left-2499.75 h-0 w-0 overflow-hidden">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      {failure ? (
        <p role="alert" className="text-[15px] font-semibold text-status-danger-fg">
          {copy.errors[failure]}
        </p>
      ) : null}
      <PillButton type="submit" disabled={!ready || pending}>
        {pending ? copy.sending : copy.send}
      </PillButton>
      <p className="text-sm leading-[1.4] text-muted-foreground">
        {copy.note}{' '}
        {privacyHref ? (
          <Link href={privacyHref} prefetch={false} className="underline underline-offset-2">
            {copy.privacyLink}
          </Link>
        ) : null}
      </p>
    </form>
  );
}
