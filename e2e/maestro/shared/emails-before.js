// F001 sign-in sub-flow: counts the emails the fake Brevo server (apps/web/e2e/fake-brevo.ts) holds for EMAIL, before
// the sign-in email is asked for, so newest-code.js waits for a newer one and never types the code of an older one, and
// sets the time (20 s from now) the flow waits for it until: the flow's loop counts time, not turns, because a turn takes
// 0.5 s on Android and over 2 s on iOS.
// BREVO_URL is set by scripts/maestro.sh; Maestro runs on the host, where that server listens.
const response = http.get(BREVO_URL + '/emails?to=' + encodeURIComponent(EMAIL));
output.emailsBefore = json(response.body).length;
output.deadline = Date.now() + 20000;
