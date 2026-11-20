import { Label } from '@fivvi/ui/components/label';
import { Textarea } from '@fivvi/ui/components/textarea';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { type ReactNode, useId } from 'react';

/**
 * A titled section of a long form (`DECISIONS.md` §6: *Naam en omschrijving*, *De les*,
 * *Wanneer*): its heading, with a line above it when it is not the first.
 */
export function FormSection({
  title,
  first = false,
  children,
}: {
  title: string;
  first?: boolean;
  children: ReactNode;
}) {
  const heading = useId();
  return (
    <section
      aria-labelledby={heading}
      className={first ? 'grid gap-3' : 'grid gap-3 border-t pt-4'}
    >
      <h3 id={heading} className="text-sm font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A labelled text area with its message under it, like `Field` for a text line. */
export function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  name,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  name: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className={error ? 'text-status-danger-fg' : undefined}>
        {label}
      </Label>
      <Textarea
        id={id}
        name={name}
        rows={3}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <ErrorLine id={`${id}-error`}>{error}</ErrorLine> : null}
    </div>
  );
}
