import { resolveCommunicationLanguage } from '@fivvi/i18n';

// The send function takes a language only as a resolver returns it (F049), tests included.
/** Dutch, as the resolver returns it for a workspace that defaults to it. */
export const dutch = resolveCommunicationLanguage({ workspaceDefault: 'nl-NL' });
/** English, as the resolver returns it for a workspace that defaults to it. */
export const english = resolveCommunicationLanguage({ workspaceDefault: 'en' });
