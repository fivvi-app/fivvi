import { Bricolage_Grotesque } from 'next/font/google';

/**
 * The display face (AC9), self-hosted: next/font downloads it at build time and the app serves the
 * files itself, so no font request leaves the origin. Its @font-face is named "Bricolage
 * Grotesque", the first family of the token `font.family.display`, so the kit's `font-display`
 * picks it up and falls back to the token's system stack (not next/font's adjusted Arial).
 * Importing this module adds the @font-face.
 */
export const displayFont = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap' });
