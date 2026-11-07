import { cn } from 'cn';
import { type ComponentProps, type ReactNode, useId } from 'react';
import { Input } from '../components/input';
import { Label } from '../components/label';
import { WarningIcon } from './icons';

/**
 * A labelled text field with its error state: the field turns red, a warning icon and the message
 * come under it, and the input points at the message (`aria-invalid`, `aria-describedby`). A hint
 * shows while there is no error. The texts come from `packages/i18n`.
 */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'aria-invalid'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const messageId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div data-slot="field" className="grid gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={cn('aria-invalid:ring-2 aria-invalid:ring-destructive', className)}
        {...props}
      />
      {error ? (
        <p
          id={messageId}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-status-danger-fg"
        >
          <WarningIcon className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
