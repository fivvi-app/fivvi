// The inbox preview line: the line mail lists show after the subject. It is a hidden block with the
// line and nothing else.
//
// React Email's own `<Preview>` also fills the block with about 150 `&nbsp;` and invisible
// characters (U+200B, U+200C, U+200D, U+200E, U+200F, U+FEFF) to push the body text out of the
// preview. Hidden, obfuscated text is a known spam signal: Outlook.com filed a Fivvi email in Junk
// with that padding (#1514). Without it, a client may show a few words of the body after the line
// when the line is short; that is the price of not looking like a spammer.

/** How much of the line a client shows at most; the same cut `<Preview>` makes. */
export const previewMaxLength = 200;

export function PreviewText({ children }: { children: string }) {
  return (
    <div
      data-skip-in-text
      style={{
        display: 'none',
        overflow: 'hidden',
        lineHeight: '1px',
        opacity: 0,
        maxHeight: 0,
        maxWidth: 0,
      }}
    >
      {children.substring(0, previewMaxLength)}
    </div>
  );
}
