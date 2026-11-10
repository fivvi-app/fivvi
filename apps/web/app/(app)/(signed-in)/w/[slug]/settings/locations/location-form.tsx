'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Schemas } from '@fivvi/contract';
import { Button } from '@fivvi/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@fivvi/ui/components/card';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { Field } from '@fivvi/ui/kit/field';
import { PageShell } from '@fivvi/ui/kit/page-shell';
import { SuccessLine } from '@fivvi/ui/kit/success-line';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { clearLookupFilled, type FilledAddress, fillFromLookup } from './fill-from-lookup';
import {
  type AddressQuery,
  type LocationField,
  type LocationRefusals,
  lookupAddress,
  saveLocation,
} from './location-client';

type Location = Schemas['Location'];

/** How long typing must pause before the postcode and house number are looked up. */
const LOOKUP_PAUSE_MS = 600;

const TYPE_KEY = {
  organization_location: 'organizationLocation',
  external_gym: 'externalGym',
  client_home: 'clientHome',
  outdoor: 'outdoor',
  online: 'online',
  other: 'other',
} as const satisfies Record<Location['type'], string>;

/** The `settingsLocation.errors.*` key that words a refused field; none for a combination we don't word. */
function errorKey(field: LocationField, refusals: LocationRefusals) {
  const problem = refusals[field];
  if (field === 'name') {
    if (problem === 'required') return 'nameRequired';
    return problem === 'tooLong' ? 'nameTooLong' : null;
  }
  if (field === 'postcode') return problem === 'invalid' ? 'postcodeInvalid' : null;
  if (field === 'houseNumber') return problem === 'invalid' ? 'houseNumberInvalid' : null;
  return problem === 'tooLong' ? 'tooLong' : null;
}

/** A lookup is made from a query whose postcode and house number are both filled in. */
const queryKey = ({ postcode, houseNumber, houseNumberAddition }: AddressQuery) =>
  JSON.stringify([
    postcode.replaceAll(' ', '').toUpperCase(),
    houseNumber.trim(),
    houseNumberAddition.trim().toUpperCase(),
  ]);

/**
 * TW-08, Settings → Location (F015, Owner only): the name of the workspace's one location, its
 * type read-only, and an optional Dutch address. Once a postcode and a house number are filled in
 * (on blur, or after a pause in typing) the street and the city are looked up through our API and
 * filled in; a field the Owner typed is never replaced, and the form never waits for the lookup.
 * Nothing is checked here: the API's answer words the field errors, and a refused form stays as
 * typed. After a save the page asks the server again, so every page shows the saved location.
 */
export function LocationForm({
  workspaceId,
  locationId,
  name,
  type,
  address,
}: {
  workspaceId: string;
  locationId: string;
  name: string;
  type: Location['type'];
  address: Location['address'];
}) {
  const t = useTranslations('settingsLocation');
  const tNav = useTranslations('workspaceNav');
  const router = useRouter();
  const [values, setValues] = useState({
    name,
    postcode: address?.postcode ?? '',
    houseNumber: address?.houseNumber ?? '',
    houseNumberAddition: address?.houseNumberAddition ?? '',
  });
  // Saved street and city count as typed: a lookup never replaces them unasked.
  const [place, setPlace] = useState<FilledAddress>({
    street: address?.street ?? '',
    city: address?.city ?? '',
    streetFilled: false,
    cityFilled: false,
  });
  const [lookup, setLookup] = useState<'idle' | 'busy' | 'not-found' | 'unavailable'>('idle');
  const [refusals, setRefusals] = useState<LocationRefusals>({});
  const [failure, setFailure] = useState<'noConnection' | 'generic' | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  // The button waits for the page to hydrate: a click before that would submit the form natively.
  const [ready, setReady] = useState(false);
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The query last looked up (the saved one at first), so blurring a field asks nothing new.
  const looked = useRef(queryKey(values));
  // A newer lookup, or leaving the page, makes an older answer obsolete.
  const generation = useRef(0);

  useEffect(() => {
    setReady(true);
    return () => {
      clearTimeout(pause.current);
      generation.current += 1;
    };
  }, []);

  async function runLookup(query: AddressQuery) {
    const key = queryKey(query);
    if (key === looked.current) return;
    looked.current = key;
    const mine = ++generation.current;
    setLookup('busy');
    const result = await lookupAddress(workspaceId, query);
    if (mine !== generation.current) return;
    if (result.kind === 'found') {
      setPlace((current) => fillFromLookup(current, result));
      setLookup('idle');
      return;
    }
    // This query has no address (or none could be had): what an earlier lookup filled belongs to
    // another query, so it goes; what the Owner typed stays. A query the API did not take as a
    // postcode and number (yet) has nothing to say.
    setPlace(clearLookupFilled);
    setLookup(result.kind === 'invalid' ? 'idle' : result.kind);
  }

  /** Looks up `query` after `delay`, when it holds a postcode and a house number. */
  function schedule(query: AddressQuery, delay: number) {
    clearTimeout(pause.current);
    if (!query.postcode.trim() || !query.houseNumber.trim()) {
      generation.current += 1;
      looked.current = '';
      setPlace(clearLookupFilled);
      setLookup('idle');
      return;
    }
    // A lookup still on its way is for another query: its answer is no longer wanted, and this
    // query (even one the Owner changed back to) is looked up afresh.
    if (queryKey(query) !== looked.current) {
      generation.current += 1;
      looked.current = '';
    }
    pause.current = setTimeout(() => void runLookup(query), delay);
  }

  function change(field: keyof typeof values, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (field !== 'name') schedule(next, LOOKUP_PAUSE_MS);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setRefusals({});
    setFailure(null);
    setSaved(false);
    const result = await saveLocation(workspaceId, locationId, {
      ...values,
      street: place.street,
      city: place.city,
    });
    setPending(false);
    if (result.ok) {
      setSaved(true);
      return router.refresh();
    }
    // Not allowed (any more): the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'fields') return setRefusals(result.refusals);
    setFailure(result.reason);
  }

  const incomplete = (['postcode', 'houseNumber', 'street', 'city'] as const).some(
    (field) => refusals[field] === 'required',
  );
  /**
   * The props of the kit's field for one input: its refusal worded under it, or red alone with the
   * address note below pointing at it when the field is only missing.
   */
  const fieldProps = (field: LocationField, id: string) => {
    const key = errorKey(field, refusals);
    const unfilled = refusals[field] === 'required' && field !== 'name';
    return {
      id,
      error: key ? t(`errors.${key}`) : undefined,
      invalid: key || refusals[field] === 'required' ? true : undefined,
      'aria-describedby': !key && unfilled ? 'location-address-error' : undefined,
    } as const;
  };
  const busy = lookup === 'busy';
  const filledNote = place.streetFilled || place.cityFilled;
  const failureMessage = failure ? t(`errors.${failure}`) : null;

  return (
    <PageShell>
      <h1 className="text-xl font-semibold tracking-tight">{tNav('settings')}</h1>
      <Card>
        <form noValidate onSubmit={submit} className="grid gap-(--card-spacing)">
          <CardHeader>
            <CardTitle>
              <h2 className="text-[15px] font-semibold">{t('title')}</h2>
            </CardTitle>
            <CardDescription>{t('help')}</CardDescription>
            <CardAction>
              <Button type="submit" disabled={!ready || pending}>
                {t('save')}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field
              {...fieldProps('name', 'location-name')}
              label={t('nameLabel')}
              name="name"
              value={values.name}
              autoComplete="off"
              onChange={(event) => change('name', event.target.value)}
            />
            <dl className="grid gap-1 text-sm">
              <dt className="text-muted-foreground">{t('typeLabel')}</dt>
              <dd>{t(`types.${TYPE_KEY[type]}`)}</dd>
            </dl>
            <fieldset className="grid gap-4">
              <legend className="mb-2 text-[13px] font-semibold">{t('addressLegend')}</legend>
              <div className="grid items-start gap-4 sm:grid-cols-3">
                <Field
                  {...fieldProps('postcode', 'location-postcode')}
                  label={t('postcodeLabel')}
                  name="postcode"
                  value={values.postcode}
                  autoComplete="postal-code"
                  onChange={(event) => change('postcode', event.target.value)}
                  onBlur={() => schedule(values, 0)}
                />
                <Field
                  {...fieldProps('houseNumber', 'location-house-number')}
                  label={t('houseNumberLabel')}
                  name="houseNumber"
                  value={values.houseNumber}
                  inputMode="numeric"
                  autoComplete="off"
                  onChange={(event) => change('houseNumber', event.target.value)}
                  onBlur={() => schedule(values, 0)}
                />
                <Field
                  {...fieldProps('houseNumberAddition', 'location-addition')}
                  label={t('additionLabel')}
                  name="houseNumberAddition"
                  value={values.houseNumberAddition}
                  autoComplete="off"
                  onChange={(event) => change('houseNumberAddition', event.target.value)}
                  onBlur={() => schedule(values, 0)}
                />
              </div>
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <Field
                  {...fieldProps('street', 'location-street')}
                  label={t('streetLabel')}
                  name="street"
                  value={place.street}
                  autoComplete="off"
                  aria-busy={busy}
                  className={busy ? 'animate-pulse' : undefined}
                  onChange={(event) =>
                    setPlace({ ...place, street: event.target.value, streetFilled: false })
                  }
                />
                <Field
                  {...fieldProps('city', 'location-city')}
                  label={t('cityLabel')}
                  name="city"
                  value={place.city}
                  autoComplete="off"
                  aria-busy={busy}
                  className={busy ? 'animate-pulse' : undefined}
                  onChange={(event) =>
                    setPlace({ ...place, city: event.target.value, cityFilled: false })
                  }
                />
              </div>
              {incomplete ? (
                <ErrorLine id="location-address-error">{t('errors.addressIncomplete')}</ErrorLine>
              ) : null}
              <div role="status" className="text-[13px] text-muted-foreground">
                {busy ? t('lookup.busy') : null}
                {lookup === 'not-found' ? t('lookup.notFound') : null}
                {lookup === 'unavailable' ? t('lookup.unavailable') : null}
                {lookup === 'idle' && filledNote ? t('lookup.filled') : null}
              </div>
            </fieldset>
            {failureMessage ? <ErrorLine>{failureMessage}</ErrorLine> : null}
            {saved ? <SuccessLine>{t('saved')}</SuccessLine> : null}
          </CardContent>
        </form>
      </Card>
    </PageShell>
  );
}
