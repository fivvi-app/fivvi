// Preloaded into the cron process by `runMain` (`node --import`): `new Date()` and `Date.now()`
// answer `FAKE_NOW`, an ISO instant, so a run's due rule (03:00 UTC) never depends on the time of
// day the test happens to run (TESTING.md §4.3). Any other `Date` use is untouched.
const fixed = new Date(process.env.FAKE_NOW ?? '').getTime();
if (Number.isNaN(fixed)) throw new Error('FAKE_NOW is not an ISO instant.');

const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...args: unknown[]) {
    // biome-ignore lint/suspicious/noExplicitAny: forwards whatever `Date` accepts.
    super(...((args.length === 0 ? [fixed] : args) as [any]));
  }
  static override now(): number {
    return fixed;
  }
}
globalThis.Date = FakeDate as DateConstructor;
