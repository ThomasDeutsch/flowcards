import { Event, EventByKey, getEvents, NestedEventObject } from "./event";
import { BaseValidationReturn } from "./action-explain";
import { Flow, FlowBidsAndPendingInformation, FlowGenerator, FlowProgressInfo, PendingExtend, TNext } from "./flow";


// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

/** all bid types */
export type BidType = "waitFor" | "askFor" | "extend" | "validate" | "block" | "request";

/**  a bid, that can be placed by a flow (has not been placed yet) */
export interface Bid<P, V> {
    type: BidType;
    event: Event<P, V>;
    isGetValueBid?: boolean;
}

export interface WaitingBid<P, V> extends Bid<P, V> {
    type: Extract<BidType, "waitFor" | "askFor" | "extend">;
    validate?: (nextValue: P) => BaseValidationReturn<V>;
}

export interface PlacedWaitingBid<P, V> extends WaitingBid<P, V> {
    id: number;
    flow: Flow;
}

export interface RequestBid<P, V> extends Bid<P, V> {
    type: Extract<BidType, "request">;
    payload: P | ((current?: P) => P) | ((current?: P) => Promise<P>);
    validate?: (nextValue: P) => BaseValidationReturn<V>;
    onlyWhenAskedFor?: true;
}

export interface PlacedRequestBid<P, V> extends RequestBid<P, V> {
    id: number;
    flow: Flow;
}

export interface ValidateBid<P, V> extends Bid<P, V> {
    type: Extract<BidType, "validate">;
    validate: (nextValue: P) => BaseValidationReturn<V>;
}

export interface PlacedValidateBid<P, V> extends ValidateBid<P, V> {
    id: number;
    flow: Flow;
}

export interface BlockBid<P, V> extends Bid<P, V> {
    type: Extract<BidType, "block">;
    validate?: () => BaseValidationReturn<V>;
}

export interface PlacedBlockBid<P, V> extends BlockBid<P,V> {
    id: number;
    flow: Flow;
}

/** bid that has been placed by a flow */
export type PlacedBid<P,V> = PlacedWaitingBid<P,V> | PlacedRequestBid<P, V> | PlacedValidateBid<P, V> | PlacedBlockBid<P, V>;

/**
 * information about the placed bids and pending information for an event
 * @internalRemarks the askForValidationId is a used for a check-optimization.
 * if this check-optimization string has changed, the event knows that the validation needs to be checked again.
 * the check-optimization string is also used for performance optimization of the scheduler.
 * If an external event is picked from the queue and the check-optimization string has not changed, the event does not need to be checked again.
 */
export interface EventInformation<P, V> {
    event: Event<P,V>;
    request: PlacedRequestBid<P, V>[];
    waitFor: PlacedWaitingBid<P, V>[];
    askFor: PlacedWaitingBid<P, V>[];
    extend: PlacedWaitingBid<P, V>[];
    validate: PlacedValidateBid<P, V>[];
    block: PlacedBlockBid<P,V>[];
    pendingRequest?: PlacedRequestBid<P,V>;
    pendingExtend?: PendingExtend<P,V>;
}

/**
 * collected information about an event, and all requesting bids.
 * 1. all placed request bids (for all event-ids) that are ordered (first bid has the highest priority)
 * 2. for every event, the event information (see EventInformation)
 * 3. for every event, a list of all active contexts (see PlacedContextBid)
 */
 export interface RequestingBidsAndEventInformation {
    requested: Map<string, PlacedRequestBid<any, any>[]>;
    eventInformation: Map<string, EventInformation<any, any>>;
}

// CORE FUNCTIONS -----------------------------------------------------------------------------------------------

/**
 * converts information about the placed bids and pending information for an event to a RequestingBidsAndEventInformation object
 * this object is used by the scheduler to validate and select actions.
 * @param placedBids all placed bids (array)
 * @returns collected information about all events and pending requests and extends (see RequestingBidsAndEventInformation)
 * @internal
 */
//TODO: analyze if this function can be optimized, by updating only the changed information
export function updateEventInformation(connectEvent: (event: Event<any, any>) => void, fb: FlowBidsAndPendingInformation): RequestingBidsAndEventInformation {
    const result: RequestingBidsAndEventInformation = {
        requested: new Map(),
        eventInformation: new Map(),
    };
    // 1. add all placed bids to the result
    fb.placedBids.forEach(bid => {
        if(!bid.event.wasUsedInAFlow) {
            connectEvent(bid.event);
        }
        if(isRequestBid(bid)) {
            if(!result.requested.has(bid.event.id)) {
                result.requested.set(bid.event.id, [bid]);
            } else {
                const bids = result.requested.get(bid.event.id)!;
                result.requested.set(bid.event.id, [...bids , bid]);
            }
        }
        const eventInfo = result.eventInformation.get(bid.event.id) ?? getInitialEventInformation(bid.event);
        eventInfo[bid.type].push(bid as any); // TODO: find a better type solution ( mapped types? )
        result.eventInformation.set(bid.event.id, eventInfo);
    });
    // 2. add pending request information to the result
    fb.pendingRequests?.forEach((pendingRequest, eventId) => {
        const eventInfo = result.eventInformation.get(eventId) ?? getInitialEventInformation(pendingRequest.event);
        eventInfo.pendingRequest = pendingRequest;
        result.eventInformation.set(eventId, eventInfo);
    });
    // 3. add pending extend information to the result
    fb.pendingExtends?.forEach((pendingExtend, eventId) => {
        const eventInfo = result.eventInformation.get(eventId) ?? getInitialEventInformation(pendingExtend.event);
        eventInfo.pendingExtend = pendingExtend;
        result.eventInformation.set(eventId, eventInfo);
    });
    return result;
}


// API -------------------------------------------------------------------------------------------------------------

/**
 * Creates a request bid
 * A request bid is a bid that requests an event to happen.
 * The payload type is the type of the event.
 * @param event the event that is requested
 * @param payload It can be a payload of the even type, of a function that returns a payload or a promise of that payload type.
 * @param validate an optional validation function that can block the request if it returns an invalid result
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a request bid
 */
export function request<P, V>(...args: Parameters<(event: Event<P, V>, payload: P| ((current?: P) => P) | ((current?: P) => Promise<P>), validate?: (nextValue: P) => BaseValidationReturn<V>) => Bid<P, V>>) {
    const event = args[0];
    return {
        type: "request",
        event,
        payload: args[1] as P,
        validate: args[2]
    } satisfies RequestBid<P, V>;
}

/**
 * Creates a request bid that will only be placed if the event is asked for.
 * @param event the event that is about to be requested
 * @param payload It can be a payload of the even type, of a function that returns a payload or a promise of that payload type.
 * @param validate an optional validation function that can block the request if it tries to set an invalid value.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a request bid
 */
export function requestWhenAskedFor<P, V>(...args: Parameters<(event: Event<P, V>, payload: P| ((current?: P) => P) | ((current?: P) => Promise<P>), validate?: (nextValue: P) => BaseValidationReturn<V>) => Bid<P, V>>) {
    const event = args[0];
    const payload = args[1] as P;
    const validate = args[2];
    return { type: 'request', event, payload, validate, onlyWhenAskedFor: true } satisfies RequestBid<P, V>;
}

/**
 * Creates an extend bid
 * An extend will create a pending event. The extending flow will hold this event pending, as long as it will set the event value ( by request or askFor bid )
 * An extend bid makes it possible for one flow to extend the behavior of another flow.
 * @param event the event that is about to be extended
 * @param validate an optional validation function that will allow the extend only for valid values.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns an extend bid
 */
export function extend<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (nextValue: P) => BaseValidationReturn<V>) => Bid<P, V>>) {
    const event = args[0];
    const validate = args[1];
    return { type: 'extend', event, validate } satisfies WaitingBid<P, V>;
}

/**
 * Creates a waitFor bid
 * A flow with a waitFor bid will pause its progression until the waited for event is processed.
 * A waitFor is different from an askFor bid. It is a passive wait, that will simply wait for the event to happen. On the other hand, an askFor bid will ask for an external event to happen.
 * @param event the event that is about to be extended
 * @param validate an optional validation function that will allow the waitFor to be proceeded if the value is valid.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a waitFor bid
 */
 export function waitFor<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (value: P) => BaseValidationReturn<V>) => Bid<P, V>>) {
    const event = args[0];
    const validate = args[1];
    return { type: 'waitFor', event, validate } satisfies WaitingBid<P, V>;
}

/**
 * Creates an askFor bid
 * A flow with an askFor bid will pause its progression until the waited for event is processed.
 * An askFor bid will ask for an external event or request to happen.
 * @param event the event that is enabled for the external event dispatch or request
 * @param validate an optional validation function that will allow the askFor to be proceeded if the value is valid.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns an askFor bid
 */
 export function askFor<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (nextValue: P) => BaseValidationReturn<V>) => Bid<P, V>>) {
    const event = args[0];
    const validate = args[1];
    return { type: 'askFor', event, validate } satisfies WaitingBid<P, V>;
}

/**
 * Creates a block bid
 * A block bid will prevent a bid from being selected.
 * Use a block instead of a validate bid, if the payload validation - and a payload validation result - is irrelevant.
 * A block will block the event independently of the payload.
 * @param event the event that is about to be extended
 * @param blockWhen optional function to block the event if it returns true
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a block bid
 */
 export function block<P, V>(event: Event<P, V>, blockIf?: () => BaseValidationReturn<V>) {
    return { type: 'block', event, validate: blockIf } satisfies BlockBid<P, V>;
}

/**
 * Creates a validate bid
 * A validate bid will validate the event payload and prevent the event from processing any flows if the validation fails.
 * Use a block instead of a validate bid, if the payload validation - and a payload validation result - is irrelevant.
 * @param event the event that is about to be extended
 * @param validate event validation function that will expect a validation result of type BaseValidationReturn.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a validate bid
 */
 export function validate<P, V>(...args: Parameters<(event: Event<P, V>, validate: (nextValue: P) => BaseValidationReturn<V>) => Bid<P, V>>) {
    return { type: 'validate', event: args[0] as Event<P,V>, validate: args[1] as (nextValue: P) => BaseValidationReturn<V> } satisfies ValidateBid<P, V>;
}


// HELPERS -------------------------------------------------------------------------------------------------------------

/**
 * check if a bid is a request bid (requesting bid)
 * @returns true if the bid is a requesting bid
 */
function isRequestBid(bid: PlacedBid<unknown, unknown>): bid is PlacedRequestBid<unknown, unknown> {
    return bid.type === "request";
}

/**
 * get initial event information
 * @returns initial event information
 */
function getInitialEventInformation<P,V>(event: Event<P, V>): EventInformation<P, V> {
    return {event, waitFor: [], askFor: [], extend: [], validate: [], block: [], request: []};
}

/**
 * helper function to guarantee a Bid[] return type if the input is not undefined
 * @param next a next value of a flow generator
 * @returns an array of bids/placed bids or undefined
 * @internal
 */
 export function toBids(next?: TNext | void): (Bid<unknown, unknown>)[] | undefined {
    if(next === undefined) return undefined;
    if (Array.isArray(next)) {
        return next;
    } else {
        return [next];
    }
}

/**
 * helper function to check if two placed bids are the same
 * @param bid1 the first bid
 * @param flowId flow id of the second bid
 * @param bidId bid id of the second bid
 * @returns true if the bids are the same
 */
export function isSameBid(bid1: PlacedBid<any, any>, flowId: string, bidId: number): boolean {
    return (bid1.id === bidId) && (bid1.flow.id === flowId);
}

/**
 * function to get the remaining bids.
 * When the function get called, the event checked and the flow was selected for continuation.
 * @internal
 * @param placedBids placed bids from a flow
 * @param eventId id of the event
 * @param bidId id of the bid
 * @param bidFlowId id of the flow that placed the bid
 * @returns the remaining bids
 * @internalRemarks
 * - validate and block bids will be removed from the remainingBids, if they are the last remaining bids
 */
export function filterRemainingBids(bidId: number, placedBids?: PlacedBid<any, any>[]): PlacedBid<any, any>[] | undefined {
    if(placedBids === undefined) return undefined;
    const remainingBids = placedBids.filter(bid => bid.id !== bidId);
    if(remainingBids.length === 0) {
        return undefined;
    }
    return remainingBids.every(bid => bid.type === "validate" || bid.type === "block") ? undefined : remainingBids;
}