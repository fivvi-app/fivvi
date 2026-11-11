import {
  type DateTimeFormatName,
  dateTimeFormats,
  defaultTimeZone,
  formattingLocales,
  type Locale,
  type MessageKey,
  messages,
} from '@fivvi/i18n';
import type { ReactElement } from 'react';
import { render } from 'react-email';
import { createTranslator } from 'use-intl/core';
import { defaultButtonPath, EmailFrameLayout, type FrameKind } from './components/frames.tsx';
import { EmailLayout } from './components/layout.tsx';

/** Email copy lives under `email.*` in the catalogs; the native exporters skip it. */
export type EmailMessageKey = Extract<MessageKey, `email.${string}`>;

export type Translate = (key: EmailMessageKey, values?: Record<string, string | number>) => string;

/** What a template gets to build its content: the locale, a translator and formatters. */
export interface EmailContext {
  locale: Locale;
  /** BCP 47 tag for `<html lang>` and Intl: `nl-NL` or `en-GB` (ADR-008). */
  lang: string;
  /** IANA time zone every date and time is shown in. */
  timeZone: string;
  t: Translate;
  /** Formats an instant with a shared format from `@fivvi/i18n`, in `timeZone`. */
  formatDateTime: (instant: Date, format: DateTimeFormatName) => string;
}

export interface EmailContextOptions {
  locale: Locale;
  /** The workspace or user time zone. Default: Europe/Amsterdam. */
  timeZone?: string;
}

/**
 * Builds the context for one locale. The translator throws on a missing key, a missing
 * placeholder value or invalid ICU, so a broken email fails the send (and the tests)
 * instead of reaching an inbox with `email.hello.subject` in it.
 */
export function createEmailContext({
  locale,
  timeZone = defaultTimeZone,
}: EmailContextOptions): EmailContext {
  const lang = formattingLocales[locale];
  const translator = createTranslator({
    locale: lang,
    messages: messages[locale],
    timeZone,
    onError: (error) => {
      throw error;
    },
  });
  return {
    locale,
    lang,
    timeZone,
    // use-intl types `values` per key; our keys are checked by EmailMessageKey instead.
    t: (key, values) => translator(key as never, values as never),
    formatDateTime: (instant, format) =>
      new Intl.DateTimeFormat(lang, { ...dateTimeFormats[format], timeZone }).format(instant),
  };
}

/**
 * The frame of an email that is about a workspace (F049): the workspace's name at the top, the
 * content, one primary button to the client web and the footer that says why the person got it.
 * A template without a frame (the sign-in email, the trainer invitation) gets the plain layout.
 */
export interface EmailFrame<Props> {
  /** `client` for an email to a client, `team` for one to a trainer or an owner. */
  kind: FrameKind;
  /** The workspace's name as typed; the frame shows it and never changes it. */
  workspaceName: (props: Props) => string;
  /** The label of the button. Default: `email.frame.button`. */
  buttonLabel?: EmailMessageKey;
  /** Where the button leads, relative to `https://fivvi.app/`; it can't leave that host. Default: `home`, the signed-in home. */
  buttonPath?: (props: Props) => string;
}

/**
 * One email type. There is one template per type, never one per language (ADR-009):
 * every string comes from the catalogs through `ctx.t`. `renderEmail` wraps the content
 * in the shared layout.
 */
export interface EmailTemplate<Props> {
  /** Stable id, e.g. `hello`. Used as the provider tag and in the preview URL. */
  id: string;
  subject: (ctx: EmailContext, props: Props) => string;
  /** The line inbox lists show after the subject. Put the key fact in it. */
  preview: (ctx: EmailContext, props: Props) => string;
  /** The content between the layout's header and footer. */
  render: (ctx: EmailContext, props: Props) => ReactElement;
  /** Set for every email about a workspace; leave out for an email without one. */
  frame?: EmailFrame<Props>;
  /** Sample props for the preview script. Obviously fake data only. */
  previewProps: Props;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export async function renderEmail<Props>(
  template: EmailTemplate<Props>,
  props: Props,
  options: EmailContextOptions,
): Promise<RenderedEmail> {
  const ctx = createEmailContext(options);
  const subject = template.subject(ctx, props);
  const preview = template.preview(ctx, props);
  const content = template.render(ctx, props);
  const { frame } = template;
  const element = frame ? (
    <EmailFrameLayout
      kind={frame.kind}
      ctx={ctx}
      subject={subject}
      preview={preview}
      workspaceName={frame.workspaceName(props)}
      buttonLabel={frame.buttonLabel ?? 'email.frame.button'}
      buttonPath={frame.buttonPath?.(props) ?? defaultButtonPath}
    >
      {content}
    </EmailFrameLayout>
  ) : (
    <EmailLayout ctx={ctx} subject={subject} preview={preview}>
      {content}
    </EmailLayout>
  );
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject, html, text };
}
