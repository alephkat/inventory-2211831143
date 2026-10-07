import { randomInt } from 'node:crypto';

/**
 * Human-facing document numbers (receipts, issues, transfers, orders, counts).
 *
 * Uniqueness is enforced by the database `@unique` constraint, so the
 * generator only has to make collisions improbable. `Math.random()` is not
 * adequate for that: a same-day burst of receipts from one warehouse can
 * collide, and a failed insert would be reported to the operator as an
 * unrelated "duplicate key" error. `crypto.randomInt` gives 36^6 (~2.2e9)
 * values per day per prefix.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

export const documentSuffix = (length = 6) => {
 let out = '';
 for (let i = 0; i < length; i += 1) {
 out += ALPHABET[randomInt(ALPHABET.length)];
 }
 return out;
};

export const documentNumber = (prefix, at = new Date()) => {
 const ymd = [
 at.getFullYear(),
 String(at.getMonth() + 1).padStart(2, '0'),
 String(at.getDate()).padStart(2, '0'),
 ].join('');
 return `${prefix}-${ymd}-${documentSuffix()}`;
};
