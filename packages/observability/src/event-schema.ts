import { z } from 'zod';

/**
 * The building blocks of the product event catalog (OBSERVABILITY.md §4). An event's
 * properties may only be UUIDs, enums, booleans, numbers and ISO dates: never free text, so a
 * name, an email address or note content can't end up in analytics.
 */

declare const allowed: unique symbol;

/** A property schema made with `property`. A plain zod schema, like `z.string()`, is not one. */
export type EventProperty<T extends z.ZodType = z.ZodType> = T & { readonly [allowed]: true };

/** The properties of one event, by `snake_case` name. */
export type EventProperties = Readonly<Record<string, EventProperty>>;

/** Event name → its properties. */
export type EventCatalog = Readonly<Record<string, EventProperties>>;

const PROPERTIES = new WeakSet<z.ZodType>();

function allow<T extends z.ZodType>(schema: T): EventProperty<T> {
  PROPERTIES.add(schema);
  return schema as EventProperty<T>;
}

export const property = {
  /** A record ID, e.g. a booking or workspace UUID. */
  uuid: () => allow(z.uuid()),
  /** One of a fixed set of values defined in code. */
  enum: <const Values extends readonly [string, ...string[]]>(values: Values) =>
    allow(z.enum(values)),
  boolean: () => allow(z.boolean()),
  /** A finite number, e.g. a count or a duration. */
  number: () => allow(z.number()),
  /** An ISO date: `2026-10-16`. */
  date: () => allow(z.iso.date()),
  /** An ISO date and time in UTC: `2026-10-16T08:00:00.000Z`. */
  dateTime: () => allow(z.iso.datetime()),
  optional: <T extends EventProperty>(schema: T) => allow(schema.optional()),
};

/** Event names are `snake_case` and past tense (`booking_confirmed`); so are property names. */
const SNAKE_CASE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/**
 * Checks the catalog when the module loads: every name is `snake_case`, and every property was
 * made with `property`, so a free-text schema fails at once, not when the event is sent.
 */
export function defineCatalog<const Catalog extends EventCatalog>(catalog: Catalog): Catalog {
  for (const [event, properties] of Object.entries(catalog)) {
    if (!SNAKE_CASE.test(event)) {
      throw new Error(`Product event "${event}" must be snake_case.`);
    }
    for (const [name, schema] of Object.entries(properties)) {
      if (!SNAKE_CASE.test(name)) {
        throw new Error(`Property "${name}" of product event "${event}" must be snake_case.`);
      }
      if (!PROPERTIES.has(schema)) {
        throw new Error(
          `Property "${name}" of product event "${event}" must be made with \`property\`.`,
        );
      }
    }
  }
  return catalog;
}

/** One event of `Catalog`, as `track()` takes it. */
export type CatalogEvent<Catalog extends EventCatalog> = {
  [Name in keyof Catalog & string]: {
    event: Name;
    /** The internal user UUID, or `anonymousDistinctId()` for an anonymous visitor. */
    distinctId: string;
    properties: z.input<z.ZodObject<Catalog[Name], z.core.$strict>>;
  };
}[keyof Catalog & string];
