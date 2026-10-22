import type { CurrencyCode, Money, RateInput } from './types';

export const TWO_DECIMAL_CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP'] as const satisfies readonly CurrencyCode[];
export const SUPPORTED_MONEY_CURRENCIES = TWO_DECIMAL_CURRENCIES;
export const RATE_SCALE = 10_000;
export const RATE_DENOMINATOR = 100 * RATE_SCALE;

export class MoneyValidationError extends Error {
  readonly code: 'invalid_currency' | 'invalid_amount' | 'unsafe_amount';

  constructor(code: MoneyValidationError['code'], message: string) {
    super(message);
    this.name = 'MoneyValidationError';
    this.code = code;
  }
}

export function isSupportedCurrency(value: string): value is CurrencyCode {
  return (TWO_DECIMAL_CURRENCIES as readonly string[]).includes(value);
}

/** Parse a decimal amount exactly, accepting no more than two fractional digits. */
export function parseMoney(value: string | number, currency: string): Money {
  if (!isSupportedCurrency(currency)) {
    throw new MoneyValidationError('invalid_currency', `Unsupported currency: ${currency}.`);
  }

  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new MoneyValidationError('invalid_amount', 'Money must be a non-negative amount with up to 2 decimal places.');
  }

  const [whole, fraction = ''] = text.split('.');
  const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minorUnits)) {
    throw new MoneyValidationError('unsafe_amount', 'Money amount is outside the safe integer range.');
  }

  return { currency, minorUnits };
}

export function moneyFromMinorUnits(minorUnits: number, currency: string): Money {
  if (!isSupportedCurrency(currency)) {
    throw new MoneyValidationError('invalid_currency', `Unsupported currency: ${currency}.`);
  }
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) {
    throw new MoneyValidationError('unsafe_amount', 'Minor units must be a non-negative safe integer.');
  }
  return { currency, minorUnits };
}

export function formatMoney(money: Money): string {
  if (!isSupportedCurrency(money.currency) || !Number.isSafeInteger(money.minorUnits) || money.minorUnits < 0) {
    throw new MoneyValidationError('invalid_amount', 'Cannot format invalid money.');
  }
  return (money.minorUnits / 100).toFixed(2);
}

/** Round an exact integer ratio to the nearest integer, resolving ties upward. */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new MoneyValidationError('unsafe_amount', 'Rounding requires safe integer operands and a positive denominator.');
  }
  const sign = numerator < 0 ? -1 : 1;
  const absolute = Math.abs(numerator);
  const quotient = Math.floor(absolute / denominator);
  const remainder = absolute % denominator;
  return sign * (quotient + (remainder * 2 >= denominator ? 1 : 0));
}

/** Return percentage points multiplied by RATE_SCALE (for example 8.25% -> 82500). */
export function rateToUnits(value: RateInput): number {
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) {
    throw new MoneyValidationError('invalid_amount', 'Rates must be percentages from 0 to 100 with up to 4 decimal places.');
  }

  const [whole, fraction = ''] = text.split('.');
  const units = Number(whole) * RATE_SCALE + Number(fraction.padEnd(4, '0'));
  if (!Number.isSafeInteger(units) || units > 100 * RATE_SCALE) {
    throw new MoneyValidationError('invalid_amount', 'Rates must be percentages from 0 to 100 with up to 4 decimal places.');
  }
  return units;
}

/** Normalize a percentage to a finite number after validating its exact decimal spelling. */
export function normalizeRate(value: RateInput): number {
  return rateToUnits(value) / RATE_SCALE;
}

export function validateRate(value: RateInput): string | null {
  try {
    rateToUnits(value);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Enter a percentage from 0 to 100.';
  }
}

export function applyRateHalfUp(amountMinor: number, rate: RateInput): number {
  const units = rateToUnits(rate);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new MoneyValidationError('unsafe_amount', 'Amount must be a non-negative safe integer.');
  }
  return roundHalfUp(amountMinor * units, RATE_DENOMINATOR);
}

export function subtractMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new MoneyValidationError('invalid_currency', 'Money currencies must match.');
  }
  return moneyFromMinorUnits(left.minorUnits - right.minorUnits, left.currency);
}
