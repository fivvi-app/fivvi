import type { ReactNode } from 'react';

// Locale handling (next-intl, lang from the request) arrives with E005.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl-NL">
      <body>{children}</body>
    </html>
  );
}
