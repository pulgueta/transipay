import { z } from "zod";

/** The limits of the discount of a course session. The server rule has the same limits. */
export const MIN_PERCENT = 1;
export const MAX_PERCENT = 99;
export const DEFAULT_PERCENT = 50;

/** An amount with more digits is not a fine. It also keeps the cents in the safe integer range. */
const MAX_PESO_DIGITS = 11;
const MAX_PESOS = 10 ** MAX_PESO_DIGITS - 1;

/** One or two digits after the last point or comma are cents. A group of thousands has three digits. */
const CENTS_PATTERN = /[.,]\d{1,2}$/u;
const NOT_A_DIGIT_PATTERN = /\D/gu;
const LEADING_ZEROS_PATTERN = /^0+/u;
const THOUSANDS_PATTERN = /\B(?=(?:\d{3})+$)/gu;

const digitsOf = (text: string) =>
  text.replaceAll(NOT_A_DIGIT_PATTERN, "").replace(LEADING_ZEROS_PATTERN, "");

/**
 * Reads the whole pesos that a person typed, for example "621.600" or "$ 621600".
 * It gives null when the text has no amount to pay.
 */
export const parsePesos = (text: string): number | null => {
  const digits = digitsOf(text.trim().replace(CENTS_PATTERN, ""));
  if (digits === "" || digits.length > MAX_PESO_DIGITS) {
    return null;
  }
  return Number(digits);
};

/**
 * The digits of the whole pesos in a pasted text, zeros included ("621.600,50" gives "621600", "0" gives "0").
 * The cents go first, so they do not become pesos.
 */
export const wholePesoDigits = (text: string) =>
  text.trim().replace(CENTS_PATTERN, "").replaceAll(NOT_A_DIGIT_PATTERN, "");

/**
 * Shows the digits of the text with a point between each group of three, as Colombia writes pesos.
 * It keeps the first eleven digits only, so the points always mark groups of three.
 */
export const formatPesosInput = (text: string) =>
  digitsOf(text).slice(0, MAX_PESO_DIGITS).replaceAll(THOUSANDS_PATTERN, ".");

/** Keeps the percent whole and in the limits of a course session. */
export const clampPercent = (value: number) =>
  Number.isNaN(value)
    ? DEFAULT_PERCENT
    : Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round(value)));

export interface CoursePayment {
  discountInCents: number;
  payableInCents: number;
}

/**
 * Finds the discount of a course and the amount that stays to pay.
 * It rounds as the server does when a citizen attends a course (`courseDiscountInCents`).
 */
export const coursePayment = (
  amountInPesos: number,
  percent: number
): CoursePayment => {
  const amountInCents = amountInPesos * 100;
  const discountInCents = Math.round((amountInCents * percent) / 100);
  return { discountInCents, payableInCents: amountInCents - discountInCents };
};

const DIGITS_ONLY_PATTERN = /^\d+$/u;

const wholeNumberIn = (min: number, max: number) =>
  z.number().int().min(min).max(max);

/** Any value that `valid` refuses reads as "not given", so a bad link still opens the page. */
const optionalValue = (valid: z.ZodType<number>) =>
  z
    .unknown()
    .transform((value) => {
      const parsed = valid.safeParse(value);
      return parsed.success ? parsed.data : undefined;
    })
    .optional();

/**
 * The values that the calculator form sends when the script does not run
 * (`/?valor=621600&descuento=37`). The router reads `0621600` as text, so the amount also accepts digits as text.
 */
export const calculatorSearchSchema = z.object({
  valor: optionalValue(
    z
      .union([
        z.number(),
        z.string().regex(DIGITS_ONLY_PATTERN).transform(Number),
      ])
      .pipe(wholeNumberIn(1, MAX_PESOS))
  ),
  descuento: optionalValue(wholeNumberIn(MIN_PERCENT, MAX_PERCENT)),
});
