import { ApiError } from '../errors/ApiError.js';
const label = (def, state) => def.labels?.[state] ?? state;
/** States reachable from `from`. Empty when `from` is terminal. */
export const allowedNext = (def, from) => def.transitions[from] ?? [];
export const isKnownState = (def, state) => def.states.includes(state);
export const isTerminal = (def, state) => def.terminal.includes(state) || allowedNext(def, state).length === 0;
export const canTransition = (def, from, to) => allowedNext(def, from).includes(to);
const describeFrom = (def, from) => {
    const next = allowedNext(def, from);
    if (next.length === 0)
        return 'no further transitions';
    return next.map((s) => label(def, s)).join(', ');
};
/**
 * Assert that `from -> to` is legal, throwing a 409 with an actionable
 * message when it is not. Rejections are conflicts, not bad requests: the
 * caller sent a well-formed request against a record that has already moved.
 */
export const assertTransition = (def, from, to, check = {}) => {
    if (!isKnownState(def, from)) {
        throw ApiError.badRequest(`Unknown ${def.name} status: ${String(from)}`);
    }
    if (!isKnownState(def, to)) {
        throw ApiError.badRequest(`Unknown ${def.name} target status: ${String(to)}`);
    }
    if (canTransition(def, from, to))
        return;
    if (check.message)
        throw ApiError.conflict(check.message);
    const target = label(def, to);
    const current = label(def, from);
    const suffix = check.describeAllowed === false ? '' : ` Allowed from ${current}: ${describeFrom(def, from)}.`;
    throw ApiError.conflict(`Cannot move ${def.name} from ${current} to ${target}.${suffix}`);
};
/**
 * Guard against a state being re-entered, e.g. two approvers racing on the
 * same record. Callers pass the state they read; if the workflow has since
 * moved on, the caller must reload and retry rather than double-apply.
 */
export const assertNoStaleRead = (def, readState, currentState, entityLabel) => {
    if (readState === currentState)
        return;
    throw ApiError.conflict(`${entityLabel} changed from ${label(def, readState)} to ${label(def, currentState)} while this request was in progress. Reload and retry.`);
};
/** Flat list of every legal transition; handy for docs and API discovery. */
export const listTransitions = (def) => def.states.flatMap((from) => allowedNext(def, from).map((to) => ({ from, to })));
