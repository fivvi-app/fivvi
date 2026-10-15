import type {
  Breadcrumb,
  DataCollection,
  Event,
  Exception,
  Mechanism,
  RequestEventData,
  StackFrame,
  User,
} from '@sentry/core';

/**
 * The scrubber (ADR-013, OBSERVABILITY.md §2): a pure allowlist applied to every event and
 * breadcrumb in `beforeSend` and `beforeBreadcrumb`, before anything leaves the process.
 * Whatever isn't listed here is dropped, so a new SDK field never leaks by default.
 */

/**
 * The SDK's own data collection, all off: no user info (so Sentry never infers the IP address),
 * cookies, headers, bodies, query strings or local variables. Sentry v11's replacement for
 * `sendDefaultPii: false`, whose defaults collect everything. The scrubber is the second line.
 */
export const NO_DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

/** Request headers worth keeping for debugging. Never cookies, auth or forwarding (IP) headers. */
const REQUEST_HEADERS = new Set(['accept', 'accept-language', 'content-length', 'content-type']);

/** Tags we set ourselves. Values are route templates, never real paths. */
const TAGS = new Set(['route']);

/** Contexts the SDK fills with facts about the runtime, never about people. */
const CONTEXTS = new Set(['app', 'cloud_resource', 'culture', 'device', 'os', 'runtime', 'trace']);

/** Breadcrumb data of HTTP requests; the URL loses its query string. */
const BREADCRUMB_DATA = new Set(['method', 'status_code', 'url']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Also catches URL-encoded addresses (`%40`) in paths.
const EMAIL = /[^\s@/?#&=:;,<>()"'[\]]+(?:@|%40)[^\s@/?#&=:;,<>()"'[\]]+\.[a-z]{2,}/gi;

/** Replaces every email address in `text`; the rest of the message stays readable. */
function maskEmails(text: string): string {
  return text.replace(EMAIL, '[email]');
}

export function scrubEvent<T extends Event>(event: T): T {
  const scrubbed: Event = {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform,
    logger: event.logger,
    server_name: event.server_name,
    environment: event.environment,
    release: event.release,
    dist: event.dist,
    sdk: event.sdk,
    transaction: event.transaction,
    fingerprint: event.fingerprint,
    debug_meta: event.debug_meta,
    // The error's own message stays (emails masked): our errors never contain personal data
    // or note content (ADR-013), and without it an error can't be debugged.
    message: maybeMask(event.message),
    logentry: event.logentry && { message: maybeMask(event.logentry.message) },
    exception: event.exception && {
      values: event.exception.values?.map(scrubException),
    },
    request: event.request && scrubRequest(event.request),
    user: event.user && scrubUser(event.user),
    tags: event.tags && pick(event.tags, TAGS),
    contexts: event.contexts && scrubContexts(event.contexts),
    breadcrumbs: event.breadcrumbs?.map(scrubBreadcrumb),
  };
  return withoutUndefined(scrubbed) as T;
}

/**
 * Breadcrumb messages are dropped: they are log lines from anywhere, including libraries,
 * and may hold any text. Only the HTTP method, status code and URL path survive in `data`.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data && pick(breadcrumb.data, BREADCRUMB_DATA);
  if (data && typeof data.url === 'string') data.url = scrubUrl(data.url);
  return withoutUndefined({
    type: breadcrumb.type,
    category: breadcrumb.category,
    level: breadcrumb.level,
    timestamp: breadcrumb.timestamp,
    event_id: breadcrumb.event_id,
    data,
  });
}

function scrubException(exception: Exception): Exception {
  return withoutUndefined({
    type: exception.type,
    value: maybeMask(exception.value),
    module: exception.module,
    thread_id: exception.thread_id,
    mechanism: exception.mechanism && scrubMechanism(exception.mechanism),
    stacktrace: exception.stacktrace && {
      frames: exception.stacktrace.frames?.map(scrubFrame),
    },
  });
}

/** `data` may carry SDK-specific details; the rest says how the error was caught. */
function scrubMechanism({ data: _data, ...mechanism }: Mechanism): Mechanism {
  return mechanism;
}

/** Local variables (`vars`) may hold anything the code was working on. */
function scrubFrame({ vars: _vars, ...frame }: StackFrame): StackFrame {
  return frame;
}

function scrubRequest(request: RequestEventData): RequestEventData {
  return withoutUndefined({
    method: request.method,
    url: request.url === undefined ? undefined : scrubUrl(request.url),
    headers:
      request.headers &&
      nonEmpty(
        pick(
          Object.fromEntries(
            Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]),
          ),
          REQUEST_HEADERS,
        ),
      ),
  });
}

/** Only the internal user UUID and the workspace UUID (`organization_id` in code). */
function scrubUser(user: User): User | undefined {
  const id = typeof user.id === 'string' && UUID.test(user.id) ? user.id : undefined;
  const workspace = user.organization_id;
  const organizationId =
    typeof workspace === 'string' && UUID.test(workspace) ? workspace : undefined;
  return nonEmpty(withoutUndefined({ id, organization_id: organizationId }));
}

function scrubContexts(contexts: NonNullable<Event['contexts']>): Event['contexts'] {
  const kept: NonNullable<Event['contexts']> = pick(contexts, CONTEXTS);
  const status = contexts.response?.status_code;
  if (status !== undefined) kept.response = { status_code: status };
  return kept;
}

/** Drops the query string and fragment, and masks emails in the path. */
function scrubUrl(url: string): string {
  const end = url.search(/[?#]/);
  return maskEmails(end === -1 ? url : url.slice(0, end));
}

function maybeMask(text: string | undefined): string | undefined {
  return text === undefined ? undefined : maskEmails(text);
}

function pick<T>(record: Record<string, T>, keys: ReadonlySet<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => keys.has(key)));
}

function nonEmpty<T extends object>(value: T): T | undefined {
  return Object.keys(value).length === 0 ? undefined : value;
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
