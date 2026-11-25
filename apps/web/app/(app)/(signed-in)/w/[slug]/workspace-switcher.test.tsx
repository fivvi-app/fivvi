import { type Locale, locales, messages, trainerWordForms } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../../test/render';
import { WorkspaceSwitcher } from './workspace-switcher';

// The switcher navigates through the router, which exists only in a running app.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

const gym = (locale: Locale) =>
  ({
    id: 'w1',
    name: "John's Gym",
    slug: 'johns-gym',
    role: 'trainer',
    trainerWord: trainerWordForms('trainer', locale),
  }) as const;
const personal = (locale: Locale) =>
  ({
    id: 'w2',
    name: 'Sarah Personal Training',
    slug: 'sarah-personal-training',
    role: 'owner',
    trainerWord: trainerWordForms('trainer', locale),
  }) as const;

// Opening it, picking a workspace, the keyboard and the remembered workspace are in
// e2e/workspace-switcher.spec.ts. Copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F012 scope switcher of the sidebar header in %s', (locale) => {
  const copy = messages[locale];

  it('AC1: with two workspaces the header is a closed menu button naming the workspace and the role', () => {
    const html = render(
      locale,
      <WorkspaceSwitcher
        name={gym(locale).name}
        slug={gym(locale).slug}
        trainerWord={gym(locale).trainerWord}
        teamRole="trainer"
        workspaces={[gym(locale), personal(locale)]}
        canCreateWorkspace={false}
      />,
    );

    expect(html).toMatch(
      new RegExp(
        `<button[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*><span[^>]*aria-hidden="true"[^>]*>[^<]*</span><span[^>]*>${escapeHtml(`John's Gym · ${trainerWordForms('trainer', locale).Word}`)}</span>`,
      ),
    );
  });

  it('AC3: one workspace and not on the allowlist: a plain label, no button', () => {
    const html = render(
      locale,
      <WorkspaceSwitcher
        name={gym(locale).name}
        slug={gym(locale).slug}
        trainerWord={gym(locale).trainerWord}
        teamRole="owner"
        workspaces={[gym(locale)]}
        canCreateWorkspace={false}
      />,
    );

    expect(html).toContain(escapeHtml(`John's Gym · ${copy.roles.owner}`));
    expect(html).not.toContain('<button');
    expect(html).not.toContain('aria-haspopup');
  });

  it('AC8: one workspace on the allowlist: still a menu button (its menu holds New workspace)', () => {
    const html = render(
      locale,
      <WorkspaceSwitcher
        name={gym(locale).name}
        slug={gym(locale).slug}
        trainerWord={gym(locale).trainerWord}
        teamRole="owner"
        workspaces={[gym(locale)]}
        canCreateWorkspace
      />,
    );

    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"/);
  });

  it.each(['trainer', 'instructeur', 'docent', 'coach'] as const)(
    'F068 AC4: a Trainer’s role in a workspace that says %s is that word, in the reader’s language',
    (choice) => {
      const forms = trainerWordForms(choice, locale);
      const html = render(
        locale,
        <WorkspaceSwitcher
          name="Yoga Loft"
          slug="yoga-loft"
          teamRole="trainer"
          trainerWord={forms}
          workspaces={[
            { ...gym(locale), name: 'Yoga Loft', slug: 'yoga-loft', trainerWord: forms },
          ]}
          canCreateWorkspace={false}
        />,
      );

      expect(html).toContain(escapeHtml(`Yoga Loft · ${forms.Word}`));
      // The word replaces the role label of the catalog; the Owner's label is not a word.
      expect(forms.Word).toBe(copy.trainerWord[choice].wordCap);
    },
  );

  it('F068 AC4: an Owner stays Owner, whatever the workspace calls its trainers', () => {
    const forms = trainerWordForms('coach', locale);
    const html = render(
      locale,
      <WorkspaceSwitcher
        name="Yoga Loft"
        slug="yoga-loft"
        teamRole="owner"
        trainerWord={forms}
        workspaces={[{ ...personal(locale), name: 'Yoga Loft', trainerWord: forms }]}
        canCreateWorkspace={false}
      />,
    );

    expect(html).toContain(escapeHtml(`Yoga Loft · ${copy.roles.owner}`));
  });
});
