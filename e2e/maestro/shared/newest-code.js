// F001 sign-in sub-flow: asks the fake Brevo server once for a sign-in email to EMAIL newer than the ones
// emails-before.js counted. A newer one: its 6-digit code is in output.code, the line of the text version that holds
// nothing else (EM-08), as apps/web/e2e/brevo.ts reads it. None yet: output.code is ''. Throws when the newest email has
// no code. The flow asks again until a code arrives (Maestro scripts can't sleep), so it fails when none does.
const response = http.get(BREVO_URL + '/emails?to=' + encodeURIComponent(EMAIL));
const emails = json(response.body);
output.code = '';
if (emails.length > output.emailsBefore) {
  const match = /^\s*(\d{6})\s*$/m.exec(emails[emails.length - 1].text);
  if (!match) {
    throw new Error('The newest email to ' + EMAIL + ' has no sign-in code.');
  }
  output.code = match[1];
}
