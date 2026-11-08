import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import type { ComponentProps, ReactNode } from 'react';

// One hue per card (the gradient tokens are one colour mixed with black), and the on-colour text
// that passes on both ends. Open Gym is not here: no screen uses it yet.
const nextCardVariants = cva('rounded-card bg-linear-to-b p-4.5', {
  variants: {
    tone: {
      accent: 'from-accent-gradient-top to-accent-gradient-bottom text-accent-on',
      private:
        'from-session-private-gradient-top to-session-private-gradient-bottom text-session-private-on-solid',
      group:
        'from-session-group-gradient-top to-session-group-gradient-bottom text-session-group-on-solid',
    },
  },
  defaultVariants: { tone: 'accent' },
});

const headings = { 2: 'h2', 3: 'h3', 4: 'h4' } as const;

/**
 * The gradient "next" card (what is next for you), in the accent or a session type's colour.
 * `children` are the actions, under the text.
 */
export function NextCard({
  className,
  tone,
  eyebrow,
  title,
  headingLevel = 2,
  meta,
  children,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> &
  VariantProps<typeof nextCardVariants> & {
    eyebrow?: ReactNode;
    title: ReactNode;
    headingLevel?: keyof typeof headings;
    /** The time or place, in the rounded face. */
    meta?: ReactNode;
  }) {
  const Heading = headings[headingLevel];

  return (
    <section
      data-slot="next-card"
      data-tone={tone ?? 'accent'}
      className={cn(nextCardVariants({ tone }), className)}
      {...props}
    >
      {eyebrow ? (
        <p className="text-[13px] font-semibold tracking-wide uppercase">{eyebrow}</p>
      ) : null}
      <Heading className="mt-1 text-2xl/7 font-bold">{title}</Heading>
      {meta ? <p className="numeric text-[15px]">{meta}</p> : null}
      {children ? <div className="mt-4 flex gap-2.5">{children}</div> : null}
    </section>
  );
}
