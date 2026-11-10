import { describe, expect, it } from 'vitest';
import { render } from '../../test/render';
import { GatePage } from './gate-page';

const inside = <span data-testid="inside" />;
const over = <span data-testid="over" />;

// E020 #626: one page for sign-in, the confirm link, welcome and no access.
describe('E020 gate page', () => {
  it('is a main with a 400 px card on the sidebar fill', () => {
    const html = render('nl-NL', <GatePage>{inside}</GatePage>);

    expect(html).toMatch(/^<main[^>]*bg-sidebar/);
    expect(html).toMatch(/data-slot="card"[^>]*max-w-100[^>]*><span data-testid="inside"/);
  });

  it('fills the window when standalone, and what the header leaves otherwise', () => {
    const standalone = render('nl-NL', <GatePage standalone>{inside}</GatePage>);
    const framed = render('nl-NL', <GatePage>{inside}</GatePage>);

    expect(standalone).toContain('min-h-dvh');
    expect(framed).toContain('flex-1');
    expect(framed).not.toContain('min-h-dvh');
  });

  it('puts what is given above over the card', () => {
    const html = render('nl-NL', <GatePage above={over}>{inside}</GatePage>);

    expect(html.indexOf('data-testid="over"')).toBeLessThan(html.indexOf('data-slot="card"'));
    expect(render('nl-NL', <GatePage>{inside}</GatePage>)).not.toContain('justify-end');
  });
});
