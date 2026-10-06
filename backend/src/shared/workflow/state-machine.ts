import { ApiError } from '../errors/ApiError';

/**
 * Generic, dependency-free workflow state machine.
 *
 * Every inventory workflow (receiving, issuing, transfers, adjustments,
 * cycle counts, purchase orders, suppliers) is described by an explicit
 * transition table. Keeping the table as data - rather than scattering
 * `if (status !== X) throw` checks through each service - means the legal
 * moves of a workflow are declared once, are enumerable for API consumers,
 * and can be exhaustively unit tested without a database.
 */

export interface WorkflowDefinition<S extends string = string> {
  /** Stable identifier, also used as the audit `resourceType` prefix. */
  readonly name: string;
  /** Every state the workflow can be in. */
  readonly states: readonly S[];
  /** The state a freshly created record starts in. */
  readonly initial: S;
  /** States from which no further transition is legal. */
  readonly terminal: readonly S[];
  /**
   * Allowed next states keyed by current state. A state with no entry (or an
   * empty array) is implicitly terminal, so omitting it is not a bug.
   */
  readonly transitions: Readonly<Record<string, readonly S[]>>;
  /** Human readable label per state, used to build error messages. */
  readonly labels?: Readonly<Partial<Record<S, string>>>;
}

export interface TransitionCheck {
  /** Include the allowed next states in the error message. */
  describeAllowed?: boolean;
  /** Overrides the message baked into the error. */
  message?: string;
}

const label = <S extends string>(def: WorkflowDefinition<S>, state: S): string =>
  def.labels?.[state] ?? state;

/** States reachable from `from`. Empty when `from` is terminal. */
export const allowedNext = <S extends string>(
  def: WorkflowDefinition<S>,
  from: S,
): readonly S[] => def.transitions[from] ?? [];

export const isKnownState = <S extends string>(def: WorkflowDefinition<S>, state: string): state is S =>
  (def.states as readonly string[]).includes(state);

export const isTerminal = <S extends string>(def: WorkflowDefinition<S>, state: S): boolean =>
  def.terminal.includes(state) || allowedNext(def, state).length === 0;

export const canTransition = <S extends string>(
  def: WorkflowDefinition<S>,
  from: S,
  to: S,
): boolean => allowedNext(def, from).includes(to);

const describeFrom = <S extends string>(def: WorkflowDefinition<S>, from: S): string => {
  const next = allowedNext(def, from);
  if (next.length === 0) return 'no further transitions';
  return next.map((s) => label(def, s)).join(', ');
};

/**
 * Assert that `from -> to` is legal, throwing a 409 with an actionable
 * message when it is not. Rejections are conflicts, not bad requests: the
 * caller sent a well-formed request against a record that has already moved.
 */
export const assertTransition = <S extends string>(
  def: WorkflowDefinition<S>,
  from: S,
  to: S,
  check: TransitionCheck = {},
): void => {
  if (!isKnownState(def, from)) {
    throw ApiError.badRequest(`Unknown ${def.name} status: ${String(from)}`);
  }
  if (!isKnownState(def, to)) {
    throw ApiError.badRequest(`Unknown ${def.name} target status: ${String(to)}`);
  }
  if (canTransition(def, from, to)) return;

  if (check.message) throw ApiError.conflict(check.message);

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
export const assertNoStaleRead = <S extends string>(
  def: WorkflowDefinition<S>,
  readState: S,
  currentState: S,
  entityLabel: string,
): void => {
  if (readState === currentState) return;
  throw ApiError.conflict(
    `${entityLabel} changed from ${label(def, readState)} to ${label(
      def,
      currentState,
    )} while this request was in progress. Reload and retry.`,
  );
};

/** Flat list of every legal transition; handy for docs and API discovery. */
export const listTransitions = <S extends string>(
  def: WorkflowDefinition<S>,
): ReadonlyArray<{ from: S; to: S }> =>
  def.states.flatMap((from) => allowedNext(def, from).map((to) => ({ from, to })));
