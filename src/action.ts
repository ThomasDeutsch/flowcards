/**
 * @internal
 * an action is created from one of the following sources.
 * A: a request bid with a payload that is not a promise (requested)
 * B: a request bid with a payload that is a promise (requestedAsync)
 * C: a resolved pending request (resolvePendingRequest)
 * D: a rejected pending request (rejectPendingRequest)
 * E: an external source (event.dispatch)
 * A valid action will be processed, causing flows to react to the action.
 * Actions are serializable and can be stored as replay data.
 * @remarks An action with the id = null is an action that was not selected as the next action by the scheduler, yet.
 */
interface BaseAction {
    type: "external" | "requested" | "requestedAsync" | "resolvePendingRequest" | "rejectPendingRequest";
    eventId: string;
    flowId: string;
    bidId: number;
}

/**
 * an external action is created if a flow has placed a valid askFor bid and
 * the event is dispatched by an external source (for example by a user/UI)
 */
export interface ExternalAction<P> extends BaseAction {
    type: "external";
    id: number | null;
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
 * a requested async action is created from a valid request bid with a payload that is a promise.
 * it will create a pending event for the promise and after the promise is resolved/rejected,
 * a resolveAsyncRequest/rejectAsyncRequest action is created.
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
    id: number | null;
    payload: P;
    requestActionId: number;
}

/**
 * a reject async request action is created if a pending event is rejected
 */
export interface RejectPendingRequestAction extends BaseAction {
    type: "rejectPendingRequest";
    id: number | null;
    requestActionId: number;
    error: any;
}

/** all possible actions */
export type Action<P> = ExternalAction<P> | ResolvePendingRequestAction<P> | RejectPendingRequestAction |  RequestedAction<P> | RequestedAsyncAction<P>;