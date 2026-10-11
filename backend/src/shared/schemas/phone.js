import { z } from 'zod';

/**
 * Zambian phone numbers.
 *
 * The national significant number is 9-10 digits behind a leading 0 (national)
 * or +260 (international), so all of these are valid and equivalent:
 *
 *   0977 123 456      mobile, national format
 *   +260 977 123 456  mobile, international format
 *   0211 234 567      landline
 *
 * Spaces, dashes, dots and brackets are allowed for readability and ignored
 * when validating; the value is stored as typed.
 */
const SEPARATORS = /[\s().-]/g;
const ZAMBIAN_PHONE = /^(?:\+?260|0)\d{9,10}$/;

export const ZAMBIAN_PHONE_EXAMPLE = '0977 123 456';

export const zambianPhone = z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()
    .refine((value) => value == null || ZAMBIAN_PHONE.test(value.replace(SEPARATORS, '')), {
        message: `Enter a Zambian phone number, e.g. ${ZAMBIAN_PHONE_EXAMPLE} or +260 977 123 456`,
    });
