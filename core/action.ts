// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

interface BaseAction {
    type: "input" | "requested" | "requestedAsync" | "resolvePendingRequest" | "rejectPendingRequest";
    eventId: string;
    flowPath: string[];
    bidId: number;
}

export interface InputAction<P> extends BaseAction {
    type: "input";
    id: number | null;
    payload: P;
}

export interface RequestedAction<P> extends BaseAction {
    type: "requested";
    id: number;
    payload: P;
}

 export interface RequestedAsyncAction<P> extends BaseAction {
    type: "requestedAsync";
    id: number;
    payload: Promise<P>;
}

export interface ResolvePendingRequestAction<P> extends BaseAction {
    type: 'resolvePendingRequest';
    id: number | null;
    payload: P;
    requestActionId: number;
}

export interface RejectPendingRequestAction extends BaseAction {
    type: "rejectPendingRequest";
    id: number | null;
    requestActionId: number;
    error: any;
}

export type Action<P> = InputAction<P> | ResolvePendingRequestAction<P> | RejectPendingRequestAction |  RequestedAction<P> | RequestedAsyncAction<P>;
export type ExtendableAction<P> = InputAction<P> | RequestedAction<P> | ResolvePendingRequestAction<P> | RequestedAsyncAction<P>;
export type LoggedAction<P> =
    InputAction<P> & {id: number} |
    ResolvePendingRequestAction<P> & {id: number} |
    RejectPendingRequestAction & {id: number} |
    RequestedAction<P> |
    Omit<RequestedAsyncAction<P>, 'payload'>