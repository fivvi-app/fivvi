/**
 * An error whose message is safe to print: it names a variable, a rule or a role, never a
 * connection string or a row value. The restore helper prints these and hides the message of any
 * other error, because a driver's message can hold a statement or a value. It keeps the name
 * "Error": other code logs `error.name` and expects it for every config error.
 */
export class SafeError extends Error {}
