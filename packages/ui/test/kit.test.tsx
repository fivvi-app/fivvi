import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { compile } from '@tailwindcss/node';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '../src/components/button';
import { Avatar } from '../src/kit/avatar';
import { ClientLayout } from '../src/kit/client-layout';
import { ErrorLine } from '../src/kit/error-line';
import { Field } from '../src/kit/field';
import { ChevronRightIcon, PersonPlusIcon, SearchIcon } from '../src/kit/icons';
import { InsetList, InsetListItem } from '../src/kit/inset-list';
import { NextCard } from '../src/kit/next-card';
import { PillButton, PillButtonStack } from '../src/kit/pill-button';
import { ProCard } from '../src/kit/pro-card';
import { RoundButton } from '../src/kit/round-button';
import { StatusPill } from '../src/kit/status-pill';
import { Toast } from '../src/kit/toast';

const html = (element: ReactElement) => renderToStaticMarkup(element);

/** The text of an HTML attribute value, as the browser reads it. */
const decodeAttribute = (value: string) =>
  value.replaceAll('&gt;', '>').replaceAll('&#x27;', "'").replaceAll('&amp;', '&');

/** The classes of the first element carrying `attribute`, as an array. */
function classesOf(markup: string, attribute: string): string[] {
  const tag = markup.match(new RegExp(`<[^>]*${attribute}[^>]*>`))?.[0] ?? '';
  return decodeAttribute(tag.match(/class="([^"]*)"/)?.[1] ?? '')
    .split(/\s+/)
    .filter(Boolean);
}

describe('E020 web kit', () => {
  describe('AC15: the primary button keeps its contrast when hovered', () => {
    it('darkens its fill on hover (the pressed token, not a filter on the label) instead of fading to a lighter pink, where white text is 3.7:1', () => {
      const classes = classesOf(html(<Button>Opslaan</Button>), 'data-slot="button"');

      expect(classes).toContain('bg-primary');
      expect(classes).toContain('hover:bg-primary-pressed');
      expect(classes).not.toContain('hover:bg-primary/80');
    });
  });

  describe('AC14: card', () => {
    it('has the card radius and the card colours', () => {
      const classes = classesOf(html(<ProCard>Anna</ProCard>), 'data-slot="pro-card"');

      expect(classes).toEqual(expect.arrayContaining(['rounded-card', 'bg-card']));
    });

    it('takes a class and any div attribute', () => {
      const markup = html(
        <ProCard className="p-6" aria-label="Tegoed">
          Anna
        </ProCard>,
      );

      expect(markup).toContain('aria-label="Tegoed"');
      expect(classesOf(markup, 'data-slot="pro-card"')).toContain('p-6');
      expect(classesOf(markup, 'data-slot="pro-card"')).not.toContain('p-4');
    });
  });

  describe('AC14: inset grouped list', () => {
    it('is a list of rows in one rounded card, with a separator inset from the left', () => {
      const markup = html(
        <InsetList aria-label="Klanten">
          <InsetListItem>Anna de Vries</InsetListItem>
          <InsetListItem>Bram</InsetListItem>
        </InsetList>,
      );

      expect(markup).toMatch(/^<ul /);
      expect(markup.match(/<li /g)).toHaveLength(2);
      expect(classesOf(markup, 'data-slot="inset-list"')).toEqual(
        expect.arrayContaining(['rounded-card', 'overflow-hidden', 'bg-card']),
      );
      // The hairline starts 16px in (`left-4`) and is drawn on every row but the first.
      const row = classesOf(markup, 'data-slot="inset-list-item"');
      expect(row).toContain('not-first:before:left-4');
      expect(row).toContain('not-first:before:bg-border');
    });
  });

  describe('AC14: pill button', () => {
    it('is a 50px pill in the accent', () => {
      const classes = classesOf(html(<PillButton>Boeken</PillButton>), 'data-slot="pill-button"');

      expect(classes).toEqual(
        expect.arrayContaining(['h-12.5', 'rounded-full', 'bg-primary', 'text-primary-foreground']),
      );
    });

    it('is a button that does not submit a form unless it is asked to', () => {
      expect(html(<PillButton>Boeken</PillButton>)).toContain('type="button"');
      expect(html(<PillButton type="submit">Boeken</PillButton>)).toContain('type="submit"');
    });

    it('has the client web variants: tonal in accent text, danger as a tint of red, ghost', () => {
      const tonal = classesOf(html(<PillButton variant="tonal">Nee</PillButton>), 'pill-button');
      const danger = classesOf(html(<PillButton variant="danger">Weg</PillButton>), 'pill-button');
      const ghost = classesOf(html(<PillButton variant="ghost">Terug</PillButton>), 'pill-button');

      // styles.css `.ios .btn.sec`: the quiet fill with accent text.
      expect(tonal).toEqual(expect.arrayContaining(['bg-secondary', 'text-accent-text']));
      expect(tonal).not.toContain('text-secondary-foreground');
      // styles.css `.btn.dng`: a tint of the danger colour with danger text, not a filled button.
      // The tint percentages are the destructive Button's, which a token test holds to 4.5:1.
      expect(danger).toEqual(
        expect.arrayContaining([
          'bg-destructive/10',
          'text-destructive',
          'dark:bg-destructive/15',
          'hover:bg-destructive/15',
          'dark:hover:bg-destructive/20',
        ]),
      );
      expect(danger).not.toContain('bg-action-danger-bg');
      expect(ghost).toContain('text-accent-text');
    });

    it('can be a link', () => {
      const markup = html(
        <PillButton asChild>
          <a href="/book">Boeken</a>
        </PillButton>,
      );

      expect(markup).toMatch(/^<a href="\/book"/);
      expect(classesOf(markup, 'data-slot="pill-button"')).toContain('rounded-full');
    });

    it('stacks at 48px with 10px between', () => {
      const markup = html(
        <PillButtonStack>
          <PillButton>Boeken</PillButton>
          <PillButton variant="tonal">Annuleren</PillButton>
        </PillButtonStack>,
      );
      const stack = classesOf(markup, 'data-slot="pill-button-stack"');

      expect(stack).toEqual(expect.arrayContaining(['flex', 'flex-col', 'gap-2.5']));
      expect(stack).toContain('[&>[data-slot=pill-button]]:h-12');
      expect(stack).toContain('[&>[data-slot=pill-button]]:w-full');
    });
  });

  describe('AC14: round control', () => {
    it('is a round 48px button that is named', () => {
      const markup = html(
        <RoundButton aria-label="Nieuw">
          <svg aria-hidden="true" />
        </RoundButton>,
      );

      expect(markup).toContain('aria-label="Nieuw"');
      expect(markup).toContain('type="button"');
      expect(classesOf(markup, 'data-slot="round-button"')).toEqual(
        expect.arrayContaining(['size-12', 'rounded-full', 'bg-primary']),
      );
    });

    it('has a glass variant for headers', () => {
      const markup = html(
        <RoundButton aria-label="Terug" variant="glass">
          <svg aria-hidden="true" />
        </RoundButton>,
      );

      expect(classesOf(markup, 'data-slot="round-button"')).toContain('glass');
    });
  });

  describe('AC14: gradient next card', () => {
    it('shows the eyebrow, the title and the meta, with the actions under them', () => {
      const markup = html(
        <NextCard eyebrow="Volgende" title="Privé met Anna" meta="09:30">
          <PillButton>Open</PillButton>
        </NextCard>,
      );

      expect(markup).toContain('Volgende');
      expect(markup).toMatch(/<h2[^>]*>Privé met Anna<\/h2>/);
      expect(markup).toMatch(/<p[^>]*numeric[^>]*>09:30<\/p>/);
      expect(markup).toContain('Open');
    });

    it('is a vertical gradient of one colour, with its on-colour text', () => {
      const accent = classesOf(html(<NextCard title="x" />), 'data-slot="next-card"');
      const privé = classesOf(html(<NextCard tone="private" title="x" />), 'data-slot="next-card"');
      const group = classesOf(html(<NextCard tone="group" title="x" />), 'data-slot="next-card"');

      expect(accent).toEqual(
        expect.arrayContaining([
          'rounded-card',
          'bg-linear-to-b',
          'from-accent-gradient-top',
          'to-accent-gradient-bottom',
          'text-accent-on',
        ]),
      );
      expect(privé).toEqual(
        expect.arrayContaining([
          'from-session-private-gradient-top',
          'to-session-private-gradient-bottom',
          'text-session-private-on-solid',
        ]),
      );
      expect(group).toEqual(
        expect.arrayContaining([
          'from-session-group-gradient-top',
          'to-session-group-gradient-bottom',
          'text-session-group-on-solid',
        ]),
      );
    });

    it('has the heading level the page needs', () => {
      expect(html(<NextCard title="x" headingLevel={3} />)).toContain('<h3');
    });
  });

  describe('AC14: status pill', () => {
    it('is a pill on the tint of its status, with the text colour that passes on it', () => {
      const tones = {
        success: ['bg-status-success-bg', 'text-status-success-text'],
        warning: ['bg-status-warning-bg', 'text-status-warning-text'],
        danger: ['bg-status-danger-bg', 'text-status-danger-text'],
        neutral: ['bg-status-neutral-bg', 'text-status-neutral-fg'],
        private: ['bg-session-private-bg', 'text-session-private-text'],
        group: ['bg-session-group-bg', 'text-session-group-text'],
      } as const;

      for (const [tone, expected] of Object.entries(tones)) {
        const classes = classesOf(
          html(<StatusPill tone={tone as keyof typeof tones}>Geboekt</StatusPill>),
          'data-slot="status-pill"',
        );
        expect(classes, tone).toEqual(expect.arrayContaining(['rounded-full', ...expected]));
      }
    });

    it('is neutral by default and keeps digits aligned', () => {
      expect(classesOf(html(<StatusPill>3/5</StatusPill>), 'status-pill')).toEqual(
        expect.arrayContaining(['bg-status-neutral-bg', 'tabular-nums']),
      );
    });
  });

  describe('AC14: avatar', () => {
    it('is a round mark hidden from screen readers, whose letters are drawn by the stylesheet', () => {
      const markup = html(<Avatar initials="AV" />);

      // The letters are no text in the page: the name beside the avatar says who it is.
      expect(markup).not.toMatch(/>\s*AV\s*</);
      expect(markup).toContain('data-initials="AV"');
      expect(markup).toContain('aria-hidden="true"');
      expect(classesOf(markup, 'data-slot="avatar"')).toEqual(
        expect.arrayContaining([
          'rounded-full',
          'bg-muted',
          'text-foreground',
          'size-7',
          'before:content-[attr(data-initials)]',
        ]),
      );
    });

    it('has a large size for a profile header', () => {
      const classes = classesOf(html(<Avatar initials="AV" size="lg" />), 'data-slot="avatar"');

      expect(classes).toEqual(expect.arrayContaining(['size-14', 'text-xl']));
      expect(classes).not.toContain('size-7');
    });
  });

  describe('icons', () => {
    it('are decorative drawings that take their colour from the text and a class', () => {
      for (const Icon of [ChevronRightIcon, PersonPlusIcon, SearchIcon]) {
        const markup = html(<Icon className="size-4" />);

        expect(markup).toMatch(/^<svg[^>]*aria-hidden="true"/);
        expect(markup).toContain('stroke="currentColor"');
        expect(classesOf(markup, 'aria-hidden')).toContain('size-4');
      }
    });
  });

  describe('AC14: error line', () => {
    it('is the warning icon and the message in the danger text, announced when it appears', () => {
      const markup = html(<ErrorLine id="oops">Geen verbinding.</ErrorLine>);

      expect(markup).toMatch(
        /<p[^>]*id="oops"[^>]*role="alert"[^>]*>\s*<svg[^>]*aria-hidden="true"[\s\S]*<\/svg>\s*Geen verbinding\.\s*<\/p>/,
      );
      expect(classesOf(markup, 'data-slot="error-line"')).toEqual(
        expect.arrayContaining(['text-status-danger-fg', 'font-semibold']),
      );
    });
  });

  describe('AC14: field with its error state', () => {
    it('ties the label to the input', () => {
      const markup = html(<Field id="name" label="Naam" />);

      expect(markup).toMatch(/<label[^>]*for="name"[^>]*>Naam<\/label>/);
      expect(markup).toMatch(/<input[^>]*id="name"/);
      expect(markup).not.toContain('aria-invalid=');
      expect(markup).not.toContain('aria-describedby');
      expect(markup).not.toContain('<svg');
    });

    it('marks the field red, with a warning icon and the message under it', () => {
      const markup = html(<Field id="name" label="Naam" error="Vul een naam in." />);
      const input = markup.match(/<input[^>]*>/)?.[0] ?? '';

      expect(input).toContain('aria-invalid="true"');
      expect(input).toContain('aria-describedby="name-error"');
      expect(markup).toMatch(
        /<p[^>]*id="name-error"[^>]*>\s*<svg[^>]*aria-hidden="true"[\s\S]*<\/svg>\s*Vul een naam in\.\s*<\/p>/,
      );
      expect(classesOf(markup, 'id="name-error"')).toContain('text-status-danger-fg');
      // The label turns red, and the input gets a solid red border with a 3px ring at 18%, in
      // both modes (the input's own dark 50% border and 40% ring are replaced).
      expect(classesOf(markup, 'for="name"')).toContain('text-status-danger-fg');
      const inputClasses = classesOf(markup, 'data-slot="input"');
      expect(inputClasses).toEqual(
        expect.arrayContaining([
          'aria-invalid:border-destructive',
          'aria-invalid:ring-3',
          'aria-invalid:ring-destructive/18',
          'dark:aria-invalid:border-destructive',
          'dark:aria-invalid:ring-destructive/18',
        ]),
      );
      expect(inputClasses).not.toContain('dark:aria-invalid:border-destructive/50');
      expect(inputClasses).not.toContain('dark:aria-invalid:ring-destructive/40');
      // The message comes after the input.
      expect(markup.indexOf('<input')).toBeLessThan(markup.indexOf('name-error"'));
    });

    it('announces the message when it appears, and not the hint', () => {
      const error = html(<Field id="name" label="Naam" hint="Zoals op de ID." error="Fout." />);
      const hint = html(<Field id="name" label="Naam" hint="Zoals op de ID." />);

      expect(error).toMatch(/<p[^>]*id="name-error"[^>]*role="alert"/);
      expect(hint).not.toContain('role="alert"');
    });

    it('has a hint, and the error replaces it', () => {
      const hint = html(<Field id="name" label="Naam" hint="Zoals op de ID." />);
      const error = html(<Field id="name" label="Naam" hint="Zoals op de ID." error="Fout." />);

      expect(hint).toContain('Zoals op de ID.');
      expect(hint).toContain('aria-describedby="name-hint"');
      expect(error).not.toContain('Zoals op de ID.');
      expect(error).toContain('aria-describedby="name-error"');
    });

    it('keeps the label as it is without an error', () => {
      expect(classesOf(html(<Field id="name" label="Naam" />), 'for="name"')).not.toContain(
        'text-status-danger-fg',
      );
    });

    it('adds the message to the descriptions the caller gave', () => {
      const markup = html(<Field id="name" label="Naam" error="Fout." aria-describedby="elders" />);
      const plain = html(<Field id="name" label="Naam" aria-describedby="elders" />);

      expect(markup).toContain('aria-describedby="name-error elders"');
      expect(plain).toContain('aria-describedby="elders"');
    });

    it('passes input attributes on', () => {
      const markup = html(
        <Field id="email" label="E-mail" type="email" autoComplete="email" required />,
      );

      expect(markup).toContain('type="email"');
      expect(markup).toContain('autoComplete="email"');
      expect(markup).toContain('required=""');
    });
  });

  describe('AC14: toast with a warning icon', () => {
    it('on the trainer web is the inverse of the page, radius 10, bottom right', () => {
      const markup = html(<Toast>Opgeslagen</Toast>);

      expect(markup).toContain('role="status"');
      expect(markup).toContain('Opgeslagen');
      expect(markup).not.toContain('<svg');
      expect(classesOf(markup, 'data-slot="toast"')).toEqual(
        expect.arrayContaining([
          'bg-foreground',
          'text-background',
          'rounded-[10px]',
          'shadow-lg',
          'px-4.5',
          'text-[15px]',
          'right-7',
          'bottom-7',
        ]),
      );
    });

    it('on the trainer web, a warning is a red fill with white text and icon, announced at once', () => {
      const markup = html(<Toast tone="warning">Niet opgeslagen</Toast>);

      expect(markup).toContain('role="alert"');
      expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/);
      expect(markup).toContain('Niet opgeslagen');
      const classes = classesOf(markup, 'data-slot="toast"');
      expect(classes).toEqual(
        expect.arrayContaining(['bg-action-danger-bg', 'text-action-danger-fg']),
      );
      expect(classes).not.toContain('bg-foreground');
    });

    it('on the client web is a glass pill above the tab bar, with the warning icon in danger', () => {
      const plain = classesOf(
        html(<Toast surface="client">Opgeslagen</Toast>),
        'data-slot="toast"',
      );
      const warning = html(
        <Toast surface="client" tone="warning">
          Niet opgeslagen
        </Toast>,
      );

      expect(plain).toEqual(
        expect.arrayContaining([
          'glass',
          'rounded-full',
          'text-foreground',
          'bottom-26',
          'left-1/2',
          '-translate-x-1/2',
        ]),
      );
      expect(plain).not.toContain('bg-foreground');
      // `shadow-lg` would come after `glass` in the CSS and replace its glass shadow.
      expect(plain).not.toContain('shadow-lg');
      expect(warning).toContain('role="alert"');
      expect(classesOf(warning, 'data-slot="toast"')).toContain('glass');
      expect(classesOf(warning, 'aria-hidden="true"')).toContain('text-status-danger-fg');
    });
  });

  describe('AC13: client layout', () => {
    it('opts into the client theme, on the touch density, with a glass header', () => {
      const markup = html(
        <ClientLayout header={<span>Fivvi</span>}>
          <p>Rooster</p>
        </ClientLayout>,
      );

      const root = markup.match(/^<div[^>]*>/)?.[0] ?? '';
      expect(root).toContain('data-theme="client"');
      expect(root).toContain('data-density="touch"');
      expect(classesOf(root, 'data-theme')).toEqual(
        expect.arrayContaining(['bg-background', 'text-foreground']),
      );
      expect(markup).toMatch(/<header[^>]*class="[^"]*\bglass\b/);
      expect(markup).toMatch(/<header[^>]*>[\s\S]*Fivvi[\s\S]*<\/header>/);
      expect(markup).toMatch(/<main[^>]*>[\s\S]*Rooster[\s\S]*<\/main>/);
    });
  });
});

describe('E020 web kit stylesheet', () => {
  const stylesheet = path.resolve(import.meta.dirname, '../src/styles/globals.css');

  /** Tailwind drops a class that is not in the theme (`text-white`, a typo), silently. */
  it('AC14: every class a block uses produces CSS', async () => {
    const markup = [
      <ProCard key="a">x</ProCard>,
      <InsetList key="b">
        <InsetListItem>x</InsetListItem>
      </InsetList>,
      <PillButtonStack key="c">
        {(['primary', 'tonal', 'danger', 'ghost'] as const).map((variant) => (
          <PillButton key={variant} variant={variant} size="sm">
            x
          </PillButton>
        ))}
      </PillButtonStack>,
      <RoundButton key="d" aria-label="x" variant="glass">
        <svg />
      </RoundButton>,
      <RoundButton key="e" aria-label="x" variant="tonal">
        <svg />
      </RoundButton>,
      <RoundButton key="f" aria-label="x">
        <svg />
      </RoundButton>,
      ...(['accent', 'private', 'group'] as const).map((tone) => (
        <NextCard key={tone} tone={tone} eyebrow="x" title="x" meta="x">
          x
        </NextCard>
      )),
      ...(['neutral', 'success', 'warning', 'danger', 'private', 'group'] as const).map((tone) => (
        <StatusPill key={tone} tone={tone}>
          x
        </StatusPill>
      )),
      <Field key="g" id="g" label="x" hint="x" />,
      <Field key="h" id="h" label="x" error="x" />,
      <Toast key="i">x</Toast>,
      <Toast key="j" tone="warning">
        x
      </Toast>,
      <Toast key="j2" surface="client">
        x
      </Toast>,
      <Toast key="j3" surface="client" tone="warning">
        x
      </Toast>,
      <Avatar key="av1" initials="x" />,
      <Avatar key="av2" initials="x" size="lg" />,
      <ClientLayout key="k" header="x">
        x
      </ClientLayout>,
    ]
      .map(html)
      .join('');
    const classes = new Set(
      [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
        decodeAttribute(match[1] ?? '')
          .split(/\s+/)
          .filter(Boolean),
      ),
    );
    expect(classes.size).toBeGreaterThan(40);

    const kit = await compile(await readFile(stylesheet, 'utf8'), {
      base: path.dirname(stylesheet),
      from: stylesheet,
      onDependency: () => undefined,
    });
    const css = kit.build([...classes]);
    const escapeSelector = (name: string) => name.replaceAll(/[^\w-]/g, '\\$&');
    const missing = [...classes].filter((name) => !css.includes(`.${escapeSelector(name)}`));

    expect(missing).toEqual([]);
  });
});
