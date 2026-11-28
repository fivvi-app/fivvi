import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The face of a block in the grid (or of a row elsewhere): a tint of the session type's colour
 * with the text colour that passes on it and a bar on the start edge; a cancelled one is grey and
 * hatched. A date taken over by a substitute (F024) is dimmed: grey like a cancelled one, without the
 * hatching and the strike-through. Colour only supports the label: the caller starts every block
 * with its type in words.
 */
export const sessionBlockVariants = cva(
  'flex size-full min-w-0 flex-col overflow-hidden rounded-md border-s-4 px-1.5 py-0.5 text-start text-xs leading-4 outline-offset-1',
  {
    variants: {
      tone: {
        private: 'border-session-private-solid bg-session-private-bg text-session-private-text',
        group: 'border-session-group-solid bg-session-group-bg text-session-group-text',
        dimmed: 'border-muted-foreground bg-muted text-muted-foreground',
        cancelled:
          'border-muted-foreground bg-muted bg-[image:repeating-linear-gradient(135deg,transparent_0_4px,var(--border)_4px_5px)] text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'private' },
  },
);

export type SessionBlockProps = VariantProps<typeof sessionBlockVariants>;
