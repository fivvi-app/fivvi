// F001 sign-in sub-flow: waits (at most 20 s) for a sign-in email to EMAIL newer than the ones emails-before.js
// counted, and puts its 6-digit code in output.code. The code is the line of the text version that holds nothing else
// (EM-08), as apps/web/e2e/brevo.ts reads it. Throws when no email arrives, which fails the flow.
const url = BREVO_URL + '/emails?to=' + encodeURIComponent(EMAIL);
const deadline = Date.now() + 20000;
let emails = [];
do {
  emails = json(http.get(url).body);
  if (emails.length > output.emailsBefore) break;
  const pause = Date.now() + 250;
  while (Date.now() < pause) {
    // Maestro scripts have no sleep: wait out the poll interval.
  }
} while (Date.now() < deadline);

if (emails.length <= output.emailsBefore) {
  throw new Error('No sign-in email to ' + EMAIL + ' arrived within 20 s.');
}
const match = /^\s*(\d{6})\s*$/m.exec(emails[emails.length - 1].text);
if (!match) {
  throw new Error('The newest email to ' + EMAIL + ' has no sign-in code.');
}
output.code = match[1];
