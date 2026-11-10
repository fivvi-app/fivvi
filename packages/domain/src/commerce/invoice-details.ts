// The details on an invoice (F059, spec #474): the seller's invoice details of a workspace and a
// client's billing details. Pure rules: the route asks, the repository stores the answer. The
// seller's KvK and VAT number are required because the Dutch invoice requirements name them
// (`PRODUCT.md §96`); a client's VAT number is optional.

import {
  ADDRESS_ADDITION_MAX_LENGTH,
  ADDRESS_TEXT_MAX_LENGTH,
  checkPostcodeAndHouseNumber,
} from '../locations/address.ts';

/** The longest legal or company name, in characters (a bound against abuse). */
export const INVOICE_NAME_MAX_LENGTH = 120;

const KVK_NUMBER = /^[0-9]{8}$/;
const VAT_NUMBER = /^NL[0-9]{9}B[0-9]{2}$/;

/** Whether `value` is a KvK number: exactly 8 digits. */
export function isKvkNumber(value: string): boolean {
  return KVK_NUMBER.test(value);
}

/** Whether `value` is a Dutch VAT number: `NL`, 9 digits, `B`, 2 digits (`NL000000000B01`). */
export function isVatNumber(value: string): boolean {
  return VAT_NUMBER.test(value);
}

export type InvoiceDetailsField =
  | 'legalName'
  | 'companyName'
  | 'street'
  | 'houseNumber'
  | 'houseNumberAddition'
  | 'postcode'
  | 'city'
  | 'kvkNumber'
  | 'vatNumber';

export interface InvoiceDetailsIssue {
  readonly field: InvoiceDetailsField;
  /** `invalid_kvk_number` and `invalid_vat_number` are the formats of the two numbers. */
  readonly code: 'required' | 'too_long' | 'invalid' | 'invalid_kvk_number' | 'invalid_vat_number';
}

/** A Dutch address as typed; every field may be empty. */
interface AddressText {
  readonly street: string;
  readonly houseNumber: string;
  readonly houseNumberAddition?: string | null | undefined;
  readonly postcode: string;
  readonly city: string;
}

interface CheckedAddress {
  readonly street: string;
  readonly houseNumber: string;
  readonly houseNumberAddition: string | null;
  readonly postcode: string;
  readonly city: string;
}

/** Checks a required address; the issues come in the order postcode, number, street, city. */
function checkAddress(
  input: AddressText,
  issues: InvoiceDetailsIssue[],
): CheckedAddress | undefined {
  const postcode = input.postcode.trim();
  const houseNumber = input.houseNumber.trim();
  const addition = (input.houseNumberAddition ?? '').trim();
  const street = input.street.trim();
  const city = input.city.trim();

  const checked = checkPostcodeAndHouseNumber(postcode, houseNumber);
  for (const issue of checked.issues) {
    issues.push({
      field: issue.field as 'postcode' | 'houseNumber',
      code: issue.problem === 'missing' ? 'required' : 'invalid',
    });
  }
  if (!street) issues.push({ field: 'street', code: 'required' });
  else if (street.length > ADDRESS_TEXT_MAX_LENGTH)
    issues.push({ field: 'street', code: 'too_long' });
  if (!city) issues.push({ field: 'city', code: 'required' });
  else if (city.length > ADDRESS_TEXT_MAX_LENGTH) issues.push({ field: 'city', code: 'too_long' });
  if (addition.length > ADDRESS_ADDITION_MAX_LENGTH) {
    issues.push({ field: 'houseNumberAddition', code: 'too_long' });
  }
  if (!checked.postcode) return undefined;
  return {
    street,
    houseNumber,
    houseNumberAddition: addition || null,
    postcode: checked.postcode,
    city,
  };
}

function checkName(
  field: 'legalName' | 'companyName',
  value: string,
  issues: InvoiceDetailsIssue[],
): string {
  const name = value.trim();
  if (!name) issues.push({ field, code: 'required' });
  else if (name.length > INVOICE_NAME_MAX_LENGTH) issues.push({ field, code: 'too_long' });
  return name;
}

/** A typed VAT number in capitals; `undefined` when it is empty. */
function typedVatNumber(value: string | null | undefined): string | undefined {
  return (value ?? '').trim().toUpperCase() || undefined;
}

/** The invoice details of a workspace as typed; every field may be empty. */
export interface InvoiceDetailsInput extends AddressText {
  readonly legalName: string;
  readonly kvkNumber: string;
  readonly vatNumber: string;
}

/** The invoice details of a workspace as stored: complete and trimmed. */
export interface InvoiceDetails extends CheckedAddress {
  readonly legalName: string;
  readonly kvkNumber: string;
  readonly vatNumber: string;
}

export type InvoiceDetailsDecision =
  | { readonly ok: true; readonly details: InvoiceDetails }
  | { readonly ok: false; readonly issues: readonly InvoiceDetailsIssue[] };

/**
 * Whether the typed invoice details are stored, and as what. Required: the legal name, street and
 * number, postcode, city, KvK number (8 digits) and VAT number (`NL` + 9 digits + `B` + 2 digits).
 * The issues come in field order: name, address, KvK, VAT.
 */
export function decideInvoiceDetails(input: InvoiceDetailsInput): InvoiceDetailsDecision {
  const issues: InvoiceDetailsIssue[] = [];
  const legalName = checkName('legalName', input.legalName, issues);
  const address = checkAddress(input, issues);

  const kvkNumber = input.kvkNumber.trim();
  if (!kvkNumber) issues.push({ field: 'kvkNumber', code: 'required' });
  else if (!isKvkNumber(kvkNumber)) issues.push({ field: 'kvkNumber', code: 'invalid_kvk_number' });

  const vatNumber = typedVatNumber(input.vatNumber);
  if (!vatNumber) issues.push({ field: 'vatNumber', code: 'required' });
  else if (!isVatNumber(vatNumber)) issues.push({ field: 'vatNumber', code: 'invalid_vat_number' });

  if (issues.length > 0 || !address || !vatNumber) return { ok: false, issues };
  return { ok: true, details: { legalName, ...address, kvkNumber, vatNumber } };
}

/**
 * Whether a workspace's invoice details are complete: all required fields filled and valid. Until
 * they are, no offer can be switched on (AC1).
 */
export function isInvoiceDetailsComplete(input: InvoiceDetailsInput | null | undefined): boolean {
  return input ? decideInvoiceDetails(input).ok : false;
}

/** The billing details of a client as typed (CW-04). */
export interface BillingDetailsInput extends AddressText {
  /** *Factuur op naam van een bedrijf* / *Invoice in a company's name*. */
  readonly asCompany: boolean;
  readonly companyName: string;
  readonly vatNumber?: string | null | undefined;
}

/** The billing details of a client as stored for a company invoice. */
export interface BillingDetails extends CheckedAddress {
  readonly companyName: string;
  readonly vatNumber: string | null;
}

export type BillingDetailsDecision =
  | { readonly ok: true; readonly billing: BillingDetails | null }
  | { readonly ok: false; readonly issues: readonly InvoiceDetailsIssue[] };

/**
 * Whether the typed billing details are stored, and as what. With the company switch on the
 * company name and the address are required and the VAT number is optional but, when given, has
 * the seller's format; with it off nothing is stored and the invoice uses the client's name. The
 * issues come in field order: company name, address, VAT.
 */
export function decideBillingDetails(input: BillingDetailsInput): BillingDetailsDecision {
  if (!input.asCompany) return { ok: true, billing: null };
  const issues: InvoiceDetailsIssue[] = [];
  const companyName = checkName('companyName', input.companyName, issues);
  const address = checkAddress(input, issues);
  const vatNumber = typedVatNumber(input.vatNumber);
  if (vatNumber && !isVatNumber(vatNumber)) {
    issues.push({ field: 'vatNumber', code: 'invalid_vat_number' });
  }
  if (issues.length > 0 || !address) return { ok: false, issues };
  return { ok: true, billing: { companyName, ...address, vatNumber: vatNumber ?? null } };
}
