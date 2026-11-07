/**
 * Questions and answers as cards, two or three to a row. The question is a heading under the
 * section's own (`h2`), so the page keeps its outline.
 */
export function FaqList({
  items,
  columns = 2,
}: {
  items: readonly { question: string; answer: string }[];
  columns?: 2 | 3;
}) {
  return (
    <div className={`mt-4 grid gap-3.5 ${columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      {items.map(({ question, answer }) => (
        <article key={question} className="rounded-card bg-card p-5.5">
          <h3 className="text-[17px] leading-tight font-semibold tracking-[-0.005em]">
            {question}
          </h3>
          <p className="mt-1.5 text-[15px] leading-[1.4] text-muted-foreground text-pretty">
            {answer}
          </p>
        </article>
      ))}
    </div>
  );
}

/** The heading over a group of questions. */
export function FaqHeading({ children }: { children: string }) {
  return (
    <h2 className="mt-11 text-[clamp(24px,3vw,32px)] font-bold tracking-[-0.02em]">{children}</h2>
  );
}
