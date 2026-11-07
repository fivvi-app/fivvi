'use client';

import { PillButton } from '@fivvi/ui/kit/pill-button';
import { useEffect, useRef, useState } from 'react';
import { classes } from './classes';
import {
  type ChainStatus,
  type ChainStep,
  type SampleAction,
  type SampleStep,
  sampleBalance,
  sampleStatus,
  sampleTransition,
} from './sample-booking';

export interface SampleBookingLabels {
  title: string;
  className: string;
  time: string;
  when: string;
  left: string;
  planned: string;
  used: string;
  book: string;
  confirm: string;
  back: string;
  attend: string;
  again: string;
  confirmTitle: string;
  confirmBody: string;
  /** What Lisa's balance says, per step: only `idle`, `booked` and `attended` have a line. */
  say: Record<'idle' | 'booked' | 'attended', string>;
  statusDone: string;
  statusLive: string;
}

export interface SampleBookingSteps {
  id: ChainStep;
  title: string;
  text: string;
}

const dot: Record<ChainStatus, string> = {
  done: 'bg-status-success-solid text-status-success-on-solid',
  live: 'bg-primary text-primary-foreground',
  todo: 'bg-foreground/10 text-muted-foreground',
};

/**
 * The sample booking (F064 AC3): the six steps from a credit pack to the balance, and a class that
 * can be booked. Booking asks for confirmation first, as the product does, then the credits move
 * and the steps tick off; the trainer's button marks attendance. It all happens on the page: no
 * request is made and nothing is stored.
 */
export function SampleBooking({
  steps,
  labels,
}: {
  steps: readonly SampleBookingSteps[];
  labels: SampleBookingLabels;
}) {
  const [step, setStep] = useState<SampleStep>('idle');
  const [touched, setTouched] = useState(false);
  const actions = useRef<HTMLDivElement>(null);
  const balance = sampleBalance(step);

  const act = (action: SampleAction) => {
    setTouched(true);
    setStep(sampleTransition(step, action));
  };

  // The button that was pressed is gone after each step: keep the keyboard on the next one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: moves the focus when the step changes
  useEffect(() => {
    if (touched) actions.current?.querySelector('button')?.focus();
  }, [step]);

  const say =
    step === 'attended'
      ? labels.say.attended
      : step === 'booked'
        ? labels.say.booked
        : labels.say.idle;

  return (
    <div className="mt-9 grid grid-cols-1 items-start gap-[clamp(20px,3vw,32px)] min-[821px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <ol className="divide-y divide-border overflow-hidden rounded-card bg-card min-[821px]:order-first max-[820px]:order-last">
        {steps.map(({ id, title, text }) => {
          const status = sampleStatus(step, id);
          return (
            <li
              key={id}
              aria-current={status === 'live' ? 'step' : undefined}
              className={classes(
                'grid grid-cols-[30px_1fr] items-center gap-3 px-5 py-3.75 transition-colors motion-reduce:transition-none',
                status === 'live' && 'bg-primary/10',
              )}
            >
              <span
                aria-hidden="true"
                className={classes(
                  'numeric grid size-6.5 place-items-center rounded-full text-[13px] font-bold',
                  dot[status],
                )}
              >
                {status === 'done' ? '✓' : steps.findIndex((s) => s.id === id) + 1}
              </span>
              <div>
                <b className="block font-semibold">{title}</b>
                {status === 'todo' ? null : (
                  <span className="sr-only">
                    {status === 'done' ? labels.statusDone : labels.statusLive}
                  </span>
                )}
                <span className="block text-[15px] leading-[1.3] text-muted-foreground">
                  {text}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="grid gap-3.5 rounded-card bg-card p-5 min-[821px]:sticky min-[821px]:top-21 max-[820px]:order-first">
        <h3 className="text-[15px] font-semibold text-muted-foreground">{labels.title}</h3>
        <div className="grid grid-cols-[auto_4px_1fr] items-center gap-3">
          <span className="numeric text-[17px] font-bold">{labels.time}</span>
          <span aria-hidden="true" className="h-10 rounded-xs bg-session-group-solid" />
          <div>
            <b className="block leading-tight font-semibold">{labels.className}</b>
            <small className="text-sm text-muted-foreground">{labels.when}</small>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <Tile value={balance.left} label={labels.left} hot />
          <Tile value={balance.planned} label={labels.planned} />
          <Tile value={balance.used} label={labels.used} />
        </dl>
        <div
          aria-hidden="true"
          className="flex h-2 gap-0.5 overflow-hidden rounded-sm bg-foreground/10"
        >
          <Bar value={balance.used} className="bg-muted-foreground" />
          <Bar value={balance.planned} className="bg-session-group-solid" />
          <Bar value={balance.left} className="bg-status-success-solid" />
        </div>
        <p
          aria-live="polite"
          className="min-h-10.5 text-[15px] leading-[1.35] text-secondary-foreground"
        >
          {say}
        </p>
        <div ref={actions} className="grid gap-2.5">
          {step === 'idle' ? (
            <PillButton className="w-full" onClick={() => act('book')}>
              {labels.book}
            </PillButton>
          ) : null}
          {step === 'confirming' ? (
            <div className="grid gap-2.5 rounded-[18px] bg-background p-3.5 text-[15px] leading-[1.35]">
              <span>
                <b className="font-semibold">{labels.confirmTitle}</b> {labels.confirmBody}
              </span>
              <PillButton className="w-full" onClick={() => act('confirm')}>
                {labels.confirm}
              </PillButton>
              <PillButton variant="tonal" className="w-full" onClick={() => act('back')}>
                {labels.back}
              </PillButton>
            </div>
          ) : null}
          {step === 'booked' ? (
            <PillButton className="w-full" onClick={() => act('attend')}>
              {labels.attend}
            </PillButton>
          ) : null}
          {step === 'attended' ? (
            <PillButton variant="tonal" className="w-full" onClick={() => act('again')}>
              {labels.again}
            </PillButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** A figure with its label: the label comes first in the HTML (a `dt` before its `dd`), the number on top. */
function Tile({ value, label, hot = false }: { value: number; label: string; hot?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col-reverse justify-end rounded-2xl bg-background p-3">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd
        className={classes(
          'numeric text-[32px] leading-none font-extrabold',
          hot && 'text-accent-text',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <i
      className={classes(
        'block h-full transition-[width] duration-400 motion-reduce:transition-none',
        className,
      )}
      style={{ width: `${value * 10}%` }}
    />
  );
}
