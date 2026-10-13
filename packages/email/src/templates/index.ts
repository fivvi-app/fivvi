import { helloEmail } from './hello.tsx';

export { type HelloEmailProps, helloEmail } from './hello.tsx';

/** Every template, for the preview script and the render tests. Add new templates here. */
export const templates = [helloEmail] as const;
