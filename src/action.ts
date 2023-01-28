import { TupleId } from "./tuple-map";

// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

/**
 * @internal
 * all action types
 */
export type ActionType = "external" | "requested" | "triggered" | "requestedAsync" | "resolvePendingRequest" | "rejectPendingRequest";

/**
 * @internal
 * The action defines a construct that flows can react to. (action -> reaction).
 * An action is taken/created from a queue or from a request/trigger bid.
 * All actions that are processed by the scheduler are logged, and can be replayed, to restore a state.
 * An action with the id = null is an action that was not selected as the next action by the scheduler, yet.
 */
interface BaseAction {
    type: ActionType;
    id: number | null;
    eventId: TupleId;
    flowId: TupleId;
    bidId: number;
}

/**
 * an external action is created if a flow has placed a valid askFor bid and
 * the event is triggered by an external source (for example by a user/UI)
 */
export interface ExternalAction<P> extends BaseAction {
    type: "external";
    payload: P;
}

/**
 * a requested action is created from a valid request bid
 */
export interface RequestedAction<P> extends BaseAction {
    type: "requested";
    id: number;
    payload: P;
}

/**
 * a triggered action is created if a flow has placed a valid askFor bid
 * and the event is triggered by a flow with a trigger-bid
 */
export interface TriggeredAction<P> extends BaseAction {
    type: "triggered";
    id: number;
    payload: P;
}

/**
 * a requested async action is created from a valid request bid that
 * has a promise callback as payload.
 * it will create a pending event for the promise and after the promise is resolved/rejected,
 * a resolveAsyncRequest/rejectAsyncRequest action is created and added to the ActionQueue.
 */
 export interface RequestedAsyncAction<P> extends BaseAction {
    type: "requestedAsync";
    id: number;
    payload: Promise<P>;
}
/**
 * a resolve async request action is created if a pending event is resolved
 */
export interface ResolvePendingRequestAction<P> extends BaseAction {
    type: 'resolvePendingRequest';
    payload: P;
    requestActionId: number;
}

/**
 * a reject async request action is created if a pending event is rejected
 */
export interface RejectPendingRequestAction extends BaseAction {
    type: "rejectPendingRequest";
    requestActionId: number;
}

/** actions that will be created by a bid, placed by a flow */
export type ActionFromBid<P> = RequestedAction<P> | TriggeredAction<P> | RequestedAsyncAction<P>;

/** all possible actions */
export type Action<P> = ExternalAction<P> | ResolvePendingRequestAction<P> | RejectPendingRequestAction | ActionFromBid<P>;

/** all possible actions that can be extended */
export type ExtendableAction<P> =  RequestedAction<P> | TriggeredAction<P> | ExternalAction<P> | ResolvePendingRequestAction<P>;