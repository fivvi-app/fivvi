import { cn } from 'cn';
import { type ComponentProps, type ReactNode, useId } from 'react';
import { Input } from '../components/input';
import { Label } from '../components/label';
import { WarningIcon } from './icons';

/**
 * A labelled text field with its error state: the label and the field turn red, a warning icon and the message
 * come under it, and the input points at the message (`aria-invalid`, `aria-describedby`). A hint
 * shows while there is no error. The message is announced when it appears (`role="alert"`). The texts come from `packages/i18n`.
 */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  'aria-describedby': describedBy,
  ...props
}: Omit<ComponentProps<typeof Input>, 'aria-invalid'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const messageId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  const descriptions = [messageId, describedBy].filter(Boolean).join(' ') || undefined;

  return (
    <div data-slot="field" className="grid gap-1.5">
      <Label htmlFor={inputId} className={cn(error && 'text-status-danger-fg')}>
        {label}
      </Label>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptions}
        className={cn(
          // A solid red border with a 3px ring at 18%, in light and dark (the input's own dark
          // values, 50% border and 40% ring, are replaced).
          'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/18 dark:aria-invalid:border-destructive dark:aria-invalid:ring-destructive/18',
          className,
        )}
        {...props}
      />
      {error ? (
        <p
          id={messageId}
          role="alert"
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
