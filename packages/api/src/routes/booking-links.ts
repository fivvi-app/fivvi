import {
  type BookingLinkView,
  deactivateBookingLink,
  ensureStandingBookingLinks,
  findBookingLinkSession,
  findGroupClass,
  findOwnTeamMember,
  findWorkspace,
  getOrCreateBookingLink,
  listBookingLinks,
} from '@fivvi/database';
import {
  BOOKING_LINK_LANGUAGES,
  BOOKING_LINK_SCOPES,
  bookingLinkUrl,
  checkBookingLinkRequest,
  decideBookingLinkCreate,
  decideBookingLinkSession,
  STANDING_BOOKING_LINKS,
  sortBookingLinks,
} from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  FORBIDDEN,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';

// The booking links of a workspace (F037, spec #473; `PRODUCT.md §32`): the short links
// `{app address}/l/{code}` that open the client timetable on a scope, for approved clients only
// (ADR-026). Three routes: the list (made with the standing links *Alle boekingen* and
// *Groepslessen* on the first read), get-or-create, and deactivate. The whole team lists and copies
// (`booking_link.copy`: a Trainer gets or creates the link of a class date in the visitor's
// language); the Owner makes any link and deactivates (`booking_link.manage`). A link's scope,
// target and language never change (QE07): there is no edit route. The rules (format, URL, who may
// make which link, which dates may have one, the order) are in @fivvi/domain; the record is
// `booking_links` (packages/database). The code is only ever part of the URL, and no log line or
// product event carries it.

const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const LinkParamsSchema = WorkspaceParamsSchema.extend({
  linkId: z.uuid().openapi({
    param: { name: 'linkId', in: 'path' },
    description: 'The booking link ID.',
  }),
});

const ScopeSchema = z.enum(BOOKING_LINK_SCOPES).openapi({
  description:
    'What the link opens: `all` (*Alle boekingen*), `group` (*Groepslessen*), `class` (*Eén ' +
    'les*) or `session` (*Eén les op een datum*). Open Gym returns with F034 to F036.',
});

const LanguageSchema = z.enum(BOOKING_LINK_LANGUAGES).openapi({
  description:
    'The page language: `visitor` (*Taal van de bezoeker*), or always Dutch (`nl`) or English ' +
    '(`en`). The visitor can always switch language themselves (ADR-017).',
});

const ClassNameSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The class ID.' }),
    nameNl: z.string().openapi({ description: 'The Dutch name: always there.' }),
    nameEn: z.string().nullable().openapi({
      description: 'The English name, `null` without one. Show the Dutch name then.',
    }),
  })
  .openapi('BookingLinkClass', { description: 'A class by name, as the list labels a link.' });

const BookingLinkSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The booking link ID.' }),
    url: z.url().openapi({
      description:
        'The short link in full, `https://…/l/{code}`. The QR code and the poster show this same ' +
        'link (F038).',
    }),
    scope: ScopeSchema,
    language: LanguageSchema,
    active: z.boolean().openapi({
      description: '`false` once the Owner has deactivated it; it never comes back.',
    }),
    deactivatedAt: z.iso.datetime().nullable().openapi({
      description: 'When it was deactivated, a UTC instant; `null` while it is active.',
    }),
    createdAt: z.iso.datetime().openapi({ description: 'When it was made, a UTC instant.' }),
    groupClass: ClassNameSchema.nullable().openapi({
      description: 'The class of a `class` link; `null` for the other scopes.',
    }),
    date: z
      .object({
        id: z.uuid().openapi({ description: 'The class date (session) ID.' }),
        startsAt: z.iso.datetime().openapi({ description: 'The start, a UTC instant.' }),
        timeZone: z.string().openapi({
          description: 'The workspace’s IANA time zone: show the start in it.',
        }),
        groupClass: ClassNameSchema,
      })
      .nullable()
      .openapi({ description: 'The class date of a `session` link; `null` for the other scopes.' }),
  })
  .openapi('BookingLink', {
    description:
      'A booking link of a workspace (*boekingslink*). Its scope, target and language are fixed ' +
      'for good; only its deactivation changes.',
  });

const BookingLinksSchema = z
  .object({
    links: z.array(BookingLinkSchema).openapi({
      description:
        'The workspace’s links: the active ones first (the standing links *Alle boekingen* and ' +
        '*Groepslessen*, then the others by the time they were made), then the deactivated ones.',
    }),
  })
  .openapi('BookingLinks', { description: 'The booking links of a workspace.' });

const SurfaceSchema = z
  .enum(['ios', 'android'])
  .optional()
  .openapi({
    description:
      'The app that sends the request: `ios` or `android`. A request with a bearer token records ' +
      'the product event with this surface; without it nothing is recorded. The web does not send ' +
      'it, and a request without a bearer token ignores it.',
  });

const CreateBookingLinkBodySchema = z
  .object({
    scope: ScopeSchema,
    language: LanguageSchema,
    groupClassId: z.uuid().optional().openapi({
      description: 'The class of a `class` link, and only of that scope.',
    }),
    sessionId: z
      .uuid()
      .optional()
      .openapi({
        description:
          'The class date of a `session` link, and only of that scope: an upcoming group session ' +
          'of the workspace (a private session, an Open Gym slot and a date that has passed are refused).',
      }),
    surface: SurfaceSchema,
  })
  .openapi('CreateBookingLinkRequest', {
    description: 'The link to get or make: its scope, its target and its page language.',
  });

const DeactivateBookingLinkBodySchema = z
  .object({ surface: SurfaceSchema })
  .openapi('DeactivateBookingLinkRequest', {
    description: 'Who sends the deactivation. The body is optional; the web sends none.',
  });

const copyLinks = { type: 'workspace', capability: 'booking_link.copy', client: 'none' } as const;
const manageLinks = {
  type: 'workspace',
  capability: 'booking_link.manage',
  client: 'none',
} as const;

const listBookingLinksRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/booking-links',
    operationId: 'listBookingLinks',
    tags: ['booking-links'],
    summary: 'The booking links of a workspace',
    description:
      'The workspace’s booking links, for any team member. The first list makes the standing ' +
      'links *Alle boekingen* and *Groepslessen* with the visitor’s language, once (a second ' +
      'list, or two at the same time, makes no more; a standing link that was deactivated is made ' +
      'anew). Each has its short URL and the labels of its target: the class name in both stored ' +
      'languages, the class date’s UTC start and the workspace’s time zone. A client of the ' +
      'workspace gets `403`, a person with no place in it `404`.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The links.',
        content: { 'application/json': { schema: BookingLinksSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  copyLinks,
);

const createBookingLinkRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/booking-links',
    operationId: 'createBookingLink',
    tags: ['booking-links'],
    summary: 'Get or make a booking link',
    description:
      'Gets or makes (get-or-create) the link of a scope, target and page language: an active ' +
      'link with the same scope, target and language is returned (`200`) instead of a second one; ' +
      'otherwise a new link with a new code is made (`201`). The Owner makes any link; a Trainer ' +
      'only the link of a class date with the visitor’s language (any other answers `403`). A ' +
      'target that is not in the workspace, a private session, an Open Gym slot or a class that ' +
      'does not exist answers `404`; a class date that has started or passed answers `400` ' +
      '(`date_passed`); a request that names the wrong target for its scope answers `400` with the ' +
      'field in `issues`. Records the product event `booking_link_created` with the workspace ID, ' +
      'the scope kind, the language mode and the surface (`web`, `ios` or `android`) and nothing ' +
      'else, for a new link only; the web is recorded as `web`, a request with a bearer token ' +
      'records the `surface` it names in the body and, naming none, records nothing.',
    security: SIGNED_IN,
    request: {
      params: WorkspaceParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: CreateBookingLinkBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'The active link that already existed.',
        content: { 'application/json': { schema: BookingLinkSchema } },
      },
      201: {
        description: 'The new link.',
        content: { 'application/json': { schema: BookingLinkSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  copyLinks,
);

const deactivateBookingLinkRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/booking-links/{linkId}/deactivate',
    operationId: 'deactivateBookingLink',
    tags: ['booking-links'],
    summary: 'Deactivate a booking link',
    description:
      'Stops a link for good (the Owner only; a Trainer gets `403`): it is listed as ' +
      'deactivated, never comes back, and a new link for the same scope gets a new code. ' +
      'Deactivating a link again changes nothing and answers `200` with the first time. A link ' +
      'that is not in the workspace answers `404`. Records the product event ' +
      '`booking_link_deactivated` (the same properties as `booking_link_created`) the first ' +
      'time only. The body is optional; the web sends none and is recorded as `web`.',
    security: SIGNED_IN,
    request: {
      params: LinkParamsSchema,
      body: {
        required: false,
        content: { 'application/json': { schema: DeactivateBookingLinkBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'The deactivated link.',
        content: { 'application/json': { schema: BookingLinkSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  manageLinks,
);

function present(appBaseUrl: string, timeZone: string, link: BookingLinkView) {
  return {
    id: link.id,
    url: bookingLinkUrl(appBaseUrl, link.code),
    scope: link.scope,
    language: link.language,
    active: link.deactivatedAt === null,
    deactivatedAt: link.deactivatedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    groupClass: link.groupClass,
    date: link.session
      ? {
          id: link.session.id,
          startsAt: link.session.startsAt.toISOString(),
          timeZone,
          groupClass: link.session.groupClass,
        }
      : null,
  };
}

/** The `400` for a refused field, in the shape of the contract's validation error. */
function invalid(path: string, code: string) {
  return { code: 'validation_failed' as const, issues: [{ path, code }] };
}

/**
 * The surface the request came from: the web sends no bearer token; an app names its surface, and
 * one that names none records nothing (the API does not guess). The only thing an event says of the
 * caller besides the workspace.
 */
function surfaceOf(authorization: string | undefined, named: 'ios' | 'android' | undefined) {
  return authorization ? named : ('web' as const);
}

export function registerBookingLinks(app: OpenAPIHono) {
  const router = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });

  router.openapi(listBookingLinksRoute, async (c) => {
    const scope = c.get('scope');
    const workspace = await findWorkspace(scope);
    if (!workspace) return c.json(NOT_FOUND, 404);
    await ensureStandingBookingLinks(scope, STANDING_BOOKING_LINKS);
    const links = sortBookingLinks(await listBookingLinks(scope));
    const base = c.get('dependencies').appBaseUrl();
    return c.json({ links: links.map((link) => present(base, workspace.timeZone, link)) }, 200);
  });

  router.openapi(createBookingLinkRoute, async (c) => {
    const scope = c.get('scope');
    const body = c.req.valid('json');
    const { appBaseUrl, clock, productEvents } = c.get('dependencies');
    const actor = await findOwnTeamMember(scope);
    const workspace = await findWorkspace(scope);
    if (!actor || !workspace) return c.json(NOT_FOUND, 404);

    const request = checkBookingLinkRequest(body);
    if (request.outcome === 'refused') {
      const [issue] = request.issues;
      return c.json(invalid(issue?.path ?? 'scope', issue?.code ?? 'invalid'), 400);
    }
    if (decideBookingLinkCreate(actor.role, body) === 'forbidden') return c.json(FORBIDDEN, 403);

    const { groupClassId, sessionId } = request.target;
    if (groupClassId !== null && !(await findGroupClass(scope, groupClassId))) {
      return c.json(NOT_FOUND, 404);
    }
    if (sessionId !== null) {
      const session = await findBookingLinkSession(scope, sessionId);
      if (!session) return c.json(NOT_FOUND, 404);
      const decision = decideBookingLinkSession(session, clock.now());
      if (decision === 'not-a-class-date') return c.json(NOT_FOUND, 404);
      if (decision === 'passed') return c.json(invalid('sessionId', 'date_passed'), 400);
    }

    const { link, created } = await getOrCreateBookingLink(scope, {
      scope: body.scope,
      language: body.language,
      groupClassId,
      sessionId,
      createdByTeamMemberId: actor.id,
    });

    const surface = surfaceOf(c.req.header('authorization'), body.surface);
    if (created && surface !== undefined) {
      const distinctId = c.get('account').id;
      const workspaceId = scope.workspaceId;
      // After the commit: a link that rolled back is not an event. No code, URL or ID leaves.
      c.get('afterCommit')(() =>
        productEvents.track({
          event: 'booking_link_created',
          distinctId,
          properties: {
            workspace_id: workspaceId,
            scope_kind: link.scope,
            language_mode: link.language,
            surface,
          },
        }),
      );
    }
    return c.json(present(appBaseUrl(), workspace.timeZone, link), created ? 201 : 200);
  });

  router.openapi(deactivateBookingLinkRoute, async (c) => {
    const scope = c.get('scope');
    const { linkId } = c.req.valid('param');
    // The body is optional: the web sends none.
    const named = c.req.valid('json')?.surface;
    const { appBaseUrl, clock, productEvents } = c.get('dependencies');
    const workspace = await findWorkspace(scope);
    if (!workspace) return c.json(NOT_FOUND, 404);
    const stopped = await deactivateBookingLink(scope, linkId, clock.now());
    if (!stopped) return c.json(NOT_FOUND, 404);
    const { link, changed } = stopped;

    // Only the call that set the time records the event: a repeat, or the second of two at once, does not.
    const surface = surfaceOf(c.req.header('authorization'), named);
    if (changed && surface !== undefined) {
      const distinctId = c.get('account').id;
      const workspaceId = scope.workspaceId;
      c.get('afterCommit')(() =>
        productEvents.track({
          event: 'booking_link_deactivated',
          distinctId,
          properties: {
            workspace_id: workspaceId,
            scope_kind: link.scope,
            language_mode: link.language,
            surface,
          },
        }),
      );
    }
    return c.json(present(appBaseUrl(), workspace.timeZone, link), 200);
  });

  app.route('/', router);
}
