import type { ReactNode } from 'react';

/** The width and padding of a page's content, as the home page has them. */
export const pageWidth = 'mx-auto w-full max-w-295 px-[clamp(16px,4vw,40px)]';

/**
 * The head of the pricing, help and sub-processors pages (F064): the eyebrow, the one `h1`, the
 * lead and the status line that every page carries (#611 AC19: Fivvi is being built with its first
 * gym).
 */
export function PageHead({
  eyebrow,
  headline,
  lead,
  status,
}: {
  eyebrow?: string;
  headline: string;
  lead: string;
  status: string;
}) {
  return (
    <>
      {eyebrow ? <p className="text-[15px] font-semibold text-accent-text">{eyebrow}</p> : null}
      <h1 className="mt-2 max-w-[16em] text-[clamp(40px,5.6vw,68px)] leading-[1.02] font-bold tracking-[-0.038em] text-balance">
        {headline}
      </h1>
      <p className="mt-4 max-w-[34em] text-[clamp(18px,1.9vw,21px)] leading-[1.38] text-muted-foreground text-pretty">
        {lead}
      </p>
      <p className="mt-4 flex max-w-[44em] items-baseline gap-2.5 text-[15px] leading-[1.35] text-secondary-foreground">
        <span
          aria-hidden="true"
          className="size-2 flex-none -translate-y-px rounded-full bg-primary"
        />
        {status}
      </p>
    </>
  );
}

/** A page of the three: the content width, with room under the header. */
export function InfoPage({ children }: { children: ReactNode }) {
  return <div className={`${pageWidth} pt-[clamp(32px,4.4vw,56px)]`}>{children}</div>;
}
