import { describe, expect, it } from 'vitest';
import { emailIdempotencyKey } from './idempotency-key.ts';
import { createMemoryTransport } from './memory.ts';
import { createSendEmail } from './send.ts';
import { dutch, english } from './test-languages.ts';
import type { TrainerChangeMail } from './trainer-change-mail.ts';
import { createTrainerChangeSender } from './trainer-change-sender.ts';

// F023 (spec #459, ticket #536): the sender of EM-13. Synthetic: John's Gym, Anna, Mark, Tom,
// Kracht on Tuesday 13 and 20 October 2026 at 18:00 in Amsterdam.

const location = {
  name: "John's Gym",
  address: {
    street: 'Voorbeeldstraat',
    houseNumber: '1',
    houseNumberAddition: null,
    postcode: '1234 AB',
    city: 'Amsterdam',
  },
};

const classDates: TrainerChangeMail['dates'] = [
  {
    startsAt: new Date('2026-10-13T16:00:00Z'),
    endsAt: new Date('2026-10-13T17:00:00Z'),
    location,
  },
  {
    startsAt: new Date('2026-10-20T16:00:00Z'),
    endsAt: new Date('2026-10-20T17:00:00Z'),
    location,
  },
];

const anna: TrainerChangeMail = {
  to: { email: 'anna@example.com', name: 'Anna de Vries' },
  locale: dutch,
  workspaceName: "John's Gym",
  timeZone: 'Europe/Amsterdam',
  session: { kind: 'class', nameNl: 'Kracht', nameEn: 'Strength' },
  dates: classDates,
  trainerName: 'Mike',
  trainerWord: 'trainer',
  event: 'series-1:2:mike:anna',
};

function setup() {
  const transport = createMemoryTransport();
  const sendEmail = createSendEmail({
    transport,
    sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
    replyTo: { email: 'support@example.com' },
  });
  return { transport, send: createTrainerChangeSender({ sendEmail }) };
}

describe('F023 EM-13 sender', () => {
  it('AC17: sends one email listing the dates, in the recipient’s language, with the idempotency key of EM-13 and the event', async () => {
    const { transport, send } = setup();

    await send(anna);

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: { email: 'anna@example.com' },
      locale: 'nl-NL',
      template: 'trainer-change',
      subject: 'Andere trainer: Kracht vanaf dinsdag 13 oktober',
      idempotencyKey: emailIdempotencyKey('EM-13', anna.event),
    });
    expect(transport.sent[0]?.text).toContain('dinsdag 13 oktober 2026, 18:00 tot 19:00');
    expect(transport.sent[0]?.text).toContain('dinsdag 20 oktober 2026, 18:00 tot 19:00');
  });

  it('AC17: sends Mark’s one date in English, without Anna’s name or email', async () => {
    const { transport, send } = setup();

    await send({
      ...anna,
      to: { email: 'mark@example.com', name: 'Mark Jansen' },
      locale: english,
      dates: [classDates[1] as TrainerChangeMail['dates'][number]],
      event: 'series-1:2:mike:mark',
    });

    expect(transport.sent[0]).toMatchObject({
      locale: 'en',
      subject: 'New trainer: Strength on Tuesday 20 October',
    });
    expect(transport.sent[0]?.text).not.toContain('Anna');
    expect(transport.sent[0]?.text).not.toContain('13 October');
  });

  it('writes the address the Dutch way and names a date held elsewhere', async () => {
    const { transport, send } = setup();

    await send({
      ...anna,
      dates: [
        classDates[0] as TrainerChangeMail['dates'][number],
        {
          ...(classDates[1] as TrainerChangeMail['dates'][number]),
          location: { name: 'Park', address: null },
        },
      ],
    });

    expect(transport.sent[0]?.text).toContain("John's Gym, Voorbeeldstraat 1, 1234 AB Amsterdam");
    expect(transport.sent[0]?.text).toContain('dinsdag 20 oktober 2026, 18:00 tot 19:00, Park');
  });

  it('a private session says nothing of a class', async () => {
    const { transport, send } = setup();

    await send({
      ...anna,
      session: { kind: 'private' },
      dates: [classDates[0] as TrainerChangeMail['dates'][number]],
    });

    expect(transport.sent[0]?.subject).toBe('Andere trainer: je sessie op dinsdag 13 oktober');
  });
});
