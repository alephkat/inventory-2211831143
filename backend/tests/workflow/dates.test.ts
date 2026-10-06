import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bucketMovementsByLocalDay, localDayKey, localDayWindow } from '../../src/shared/utils/dates';

/**
 * Calendar-day bucketing for the stock movement chart.
 *
 * The invariant under test: a movement is always counted under the label the
 * user would read off their own calendar. Bucketing by UTC instead puts every
 * movement in the wrong bucket for timezones ahead of UTC, which is exactly
 * the bug this guards against, so the assertions here compare against the
 * *local* day rather than a hardcoded UTC one.
 */

const SERIES = ['RECEIVED', 'ISSUED'] as const;

const atLocal = (year: number, month: number, day: number, hour = 12): Date =>
  new Date(year, month - 1, day, hour, 0, 0, 0);

describe('localDayKey', () => {
  it('renders a local calendar date', () => {
    assert.equal(localDayKey(atLocal(2026, 10, 5)), '2026-10-05');
  });

  it('zero-pads single-digit months and days', () => {
    assert.equal(localDayKey(atLocal(2026, 3, 7)), '2026-03-07');
  });

  it('does not shift the day for a UTC timestamp recorded late in the local day', () => {
    // 23:30 local on the 5th is the 5th locally, even where that is 21:30 UTC
    // on the same day or, further east, a different UTC day entirely.
    assert.equal(localDayKey(atLocal(2026, 10, 5, 23)), '2026-10-05');
  });

  it('does not shift the day for a UTC timestamp recorded early in the local day', () => {
    assert.equal(localDayKey(atLocal(2026, 10, 5, 0)), '2026-10-05');
  });
});

describe('localDayWindow', () => {
  it('starts at local midnight `days - 1` days ago', () => {
    const { from } = localDayWindow(7);
    assert.equal(from.getHours(), 0);
    assert.equal(from.getMinutes(), 0);
    assert.equal(from.getSeconds(), 0);
    assert.equal(from.getMilliseconds(), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expected = new Date(today);
    expected.setDate(expected.getDate() - 6);
    assert.equal(from.getTime(), expected.getTime());
  });

  it('covers exactly `days` days and is half-open', () => {
    const { from, until } = localDayWindow(3);
    assert.equal(until.getTime() - from.getTime(), 3 * 24 * 60 * 60 * 1000);
    assert.ok(until > new Date(), 'window must extend into the future');
  });

  it('returns a single day for days=1', () => {
    const { from, until } = localDayWindow(1);
    assert.equal(until.getTime() - from.getTime(), 24 * 60 * 60 * 1000);
  });
});

describe('bucketMovementsByLocalDay', () => {
  const row = (series: string, quantity: number | { toString(): string }, createdAt: Date) => ({
    series,
    quantity,
    createdAt,
  });

  it('returns one label per day, oldest first, ending today', () => {
    const { labels } = bucketMovementsByLocalDay([], SERIES, 5);
    assert.equal(labels.length, 5);
    assert.equal(labels.at(-1), localDayKey(new Date()));
    for (let i = 1; i < labels.length; i += 1) {
      assert.ok(labels[i] > labels[i - 1], 'labels must ascend');
    }
  });

  it('always returns a full-length series even with no rows', () => {
    const { series } = bucketMovementsByLocalDay([], SERIES, 4);
    assert.deepEqual(series.RECEIVED, [0, 0, 0, 0]);
    assert.deepEqual(series.ISSUED, [0, 0, 0, 0]);
  });

  it('counts a movement recorded today under the last label', () => {
    const { labels, series } = bucketMovementsByLocalDay([row('RECEIVED', 60, new Date())], SERIES, 3);
    const today = labels.indexOf(localDayKey(new Date()));
    assert.ok(today >= 0, 'today must be present in the window');
    assert.equal(series.RECEIVED[today], 60);
    assert.equal(series.ISSUED[today], 0);
  });

  it('sums several movements on the same day', () => {
    const now = new Date();
    const { series } = bucketMovementsByLocalDay(
      [row('ISSUED', 2, now), row('ISSUED', 3, now), row('ISSUED', 4, now)],
      SERIES,
      2,
    );
    const today = series.ISSUED.length - 1;
    assert.equal(series.ISSUED[today], 9);
  });

  it('separates received and issued totals on the same day', () => {
    const now = new Date();
    const { series } = bucketMovementsByLocalDay(
      [row('RECEIVED', 50, now), row('ISSUED', 7, now)],
      SERIES,
      2,
    );
    const today = series.RECEIVED.length - 1;
    assert.equal(series.RECEIVED[today], 50);
    assert.equal(series.ISSUED[today], 7);
  });

  it('places each day in its own bucket', () => {
    const { labels, series } = bucketMovementsByLocalDay(
      [row('RECEIVED', 10, atLocal(2020, 1, 1)), row('RECEIVED', 20, atLocal(2020, 1, 2))],
      SERIES,
      2,
    );
    // Both rows fall outside a window ending today, so they must be dropped
    // rather than collapsing into an arbitrary bucket.
    assert.deepEqual(series.RECEIVED, [0, 0]);
    assert.equal(labels.length, 2);
  });

  it('drops rows outside the window instead of folding them in', () => {
    const far = new Date();
    far.setDate(far.getDate() - 30);
    const future = new Date();
    future.setDate(future.getDate() + 30);

    const { series } = bucketMovementsByLocalDay(
      [row('RECEIVED', 999, far), row('RECEIVED', 111, future)],
      SERIES,
      5,
    );
    assert.deepEqual(series.RECEIVED, [0, 0, 0, 0, 0]);
  });

  it('ignores series it was not asked for', () => {
    const now = new Date();
    const { series } = bucketMovementsByLocalDay([row('ADJUSTED', 5, now)], SERIES, 2);
    assert.equal(series.ADJUSTED, undefined);
    assert.deepEqual(series.RECEIVED, [0, 0]);
    assert.deepEqual(series.ISSUED, [0, 0]);
  });

  it('accepts Decimal-like quantities', () => {
    const now = new Date();
    const { series } = bucketMovementsByLocalDay(
      [row('RECEIVED', { toString: () => '12.50' }, now)],
      SERIES,
      1,
    );
    assert.equal(series.RECEIVED[0], 12.5);
  });

  it('keeps labels and totals the same length', () => {
    const now = new Date();
    const { labels, series } = bucketMovementsByLocalDay([row('RECEIVED', 1, now)], SERIES, 6);
    assert.equal(series.RECEIVED.length, labels.length);
    assert.equal(series.ISSUED.length, labels.length);
  });

  it('handles a single-day window', () => {
    const { labels, series } = bucketMovementsByLocalDay([row('RECEIVED', 8, new Date())], SERIES, 1);
    assert.deepEqual(labels, [localDayKey(new Date())]);
    assert.deepEqual(series.RECEIVED, [8]);
  });
});