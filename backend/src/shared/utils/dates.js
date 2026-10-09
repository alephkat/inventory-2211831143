/**
 * Calendar-day helpers for reporting.
 *
 * Every bucket here is a *local* calendar day. That matters: `toISOString()`
 * buckets by the UTC day, which shifts the key one day earlier for any
 * timezone ahead of UTC and lines each total up with the wrong chart label.
 * `date_trunc` in Postgres has the same hazard because it uses the database
 * session timezone, which is not necessarily the one the process runs in.
 */
/** Renders a date as `YYYY-MM-DD` using the runtime's local calendar. */
export const localDayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/**
 * The half-open range `[from, until)` covering the `days` consecutive local
 * calendar days that end today. Pass this to the query so the result set stays
 * bounded, and to {@link bucketMovementsByLocalDay} so both agree on the window.
 */
export const localDayWindow = (days) => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
    const until = new Date(from);
    until.setDate(until.getDate() + days);
    return { from, until };
};
/**
 * Buckets rows into the `days` local calendar days that end today.
 *
 * `seriesNames` fixes the output shape: every named series is present with a
 * full-length array even when it has no rows, so callers can read an index
 * without guarding. Rows falling outside the window are dropped, which keeps
 * the helper safe to use with an over-broad query.
 */
export const bucketMovementsByLocalDay = (rows, seriesNames, days) => {
    const { from, until } = localDayWindow(days);
    const labels = [];
    const slotByLabel = new Map();
    for (let index = 0; index < days; index += 1) {
        const day = new Date(from);
        day.setDate(from.getDate() + index);
        const label = localDayKey(day);
        labels.push(label);
        slotByLabel.set(label, index);
    }
    const series = {};
    for (const name of seriesNames)
        series[name] = new Array(days).fill(0);
    for (const row of rows) {
        if (row.createdAt < from || row.createdAt >= until)
            continue;
        const bucket = series[row.series];
        if (!bucket)
            continue;
        const slot = slotByLabel.get(localDayKey(row.createdAt));
        if (slot === undefined)
            continue;
        bucket[slot] += Number(row.quantity);
    }
    return { labels, series };
};
