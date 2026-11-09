/** The line every page carries: Fivvi is being built with its first gym (#611 AC19). */
export function StatusLine({ children }: { children: string }) {
  return (
    <p className="mt-4 flex max-w-[44em] items-baseline gap-2.5 text-[15px] leading-[1.35] text-secondary-foreground">
      <span
        aria-hidden="true"
        className="size-2 flex-none -translate-y-px rounded-full bg-primary"
      />
      {children}
    </p>
  );
}
