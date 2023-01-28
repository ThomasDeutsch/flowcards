import { Event, EventByKey, getEvents, NestedEventObject } from "./event";
import { BaseValidationReturn } from "./action-explain";
import { Flow, FlowBidsAndPendingInformation, FlowGenerator, FlowProgressInfo, PendingExtend, TNext } from "./flow";
import { isSameTupleId, TupleId, TupleMap } from "./tuple-map";


// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

/** all bid types */
export type BidType = "waitFor" | "askFor" | "extend" | "validate" | "block" | "request" | "trigger";

/**  a bid, that can be placed by a flow (has not been placed yet) */
export interface Bid<P, V> {
    type: BidType;
    event: Event<P, V>;
}

/** all waiting placed bids */
export interface WaitingBid<P, V> extends Bid<P, V> {
    type: Extract<BidType, "waitFor" | "askFor" | "extend">;
    validate?: (nextValue: P) => BaseValidationReturn<V>;
}

export interface PlacedWaitingBid<P, V> extends WaitingBid<P, V> {
    id: number;
    flow: Flow;
}

/** placed request or trigger bids */
export interface RequestBid<P, V> extends Bid<P, V> {
    type: Extract<BidType, "request">;
    payload: P | ((current?: P) => P) | ((current?: P) => Promise<P>);
    validate?: (nextValue: P) => BaseValidationReturn<V>;
}

export interface PlacedRequestBid<P, V> extends RequestBid<P, V> {
    id: number;
    flow: Flow;
}

/** placed request or trigger bids */
export interface TriggerBid<P, V> extends Bid<P, V> {
    type: Extract<BidType, "trigger">;
    payload: P | ((current?: P) => P);
    validate?: (nextValue: P) => BaseValidationReturn<V>;
}

export interface PlacedTriggerBid<P, V> extends TriggerBid<P, V> {
    id: number;
    flow: Flow;
}

/** all placed validate bids */
export interface ValidateBid<P, V> extends Bid<P, V> {
    type: Extract<BidType, "validate">;
    validate: (nextValue: P) => BaseValidationReturn<V>;
}

export interface PlacedValidateBid<P, V> extends ValidateBid<P, V> {
    id: number;
    flow: Flow;
}

/** all placed blocking bids
 * @remarks When the validation function returns true, the flow is blocked.
*/
export interface BlockBid<P, V> extends Bid<P, V> {
    type: Extract<BidType, "block">;
    validate?: () => BaseValidationReturn<V>;
}

export interface PlacedBlockBid<P, V> extends BlockBid<P,V> {
    id: number;
    flow: Flow;
}

/** bid that has been placed by a flow */
export type PlacedBid<P,V> = PlacedWaitingBid<P,V> | PlacedRequestBid<P, V> | PlacedTriggerBid<P,V> | PlacedValidateBid<P, V> | PlacedBlockBid<P, V>;

/**
 * information about the placed bids and pending information for an event
 * @internalRemarks the askForValidationId is a used for a check-optimization.
 * if this check-optimization string has changed, the event knows that the validation needs to be checked again.
 * the check-optimization string is also used for performance optimization of the scheduler.
 * If an external event is picked from the queue and the check-optimization string has not changed, the event does not need to be checked again.
 */
export interface EventInformation<P, V> {
    event: Event<P,V>;
    trigger: PlacedTriggerBid<P, V>[];
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
 * 1. all placed request and trigger bids (for all event-ids) that are ordered (first bid has the highest priority)
 * 2. for every event, the event information (see EventInformation)
 * 3. for every event, a list of all active contexts (see PlacedContextBid)
 */
 export interface RequestingBidsAndEventInformation {
    requested: TupleMap<PlacedRequestBid<any, any>| PlacedTriggerBid<any, any>>;
    eventInformation: TupleMap<EventInformation<any, any>>;
}

// CORE FUNCTIONS -----------------------------------------------------------------------------------------------

/**
 * converts information about the placed bids and pending information for an event to a RequestingBidsAndEventInformation object
 * this object is used by the scheduler to validate and select actions.
 * @param placedBids all placed bids (array)
 * @returns collected information about all events and pending requests and extends (see RequestingBidsAndEventInformation)
 * @internal
 */
export function updateEventInformation(connectEvent: (event: Event<any, any>) => void, fb: FlowBidsAndPendingInformation): RequestingBidsAndEventInformation {
    const result: RequestingBidsAndEventInformation = {
        requested: new TupleMap(),
        eventInformation: new TupleMap(),
    };
    // 1. add all placed bids to the result
    fb.placedBids.forEach(bid => {
        if(!bid.event.wasUsedInAFlow) {
            connectEvent(bid.event);
        }
        if(isRequestingBid(bid) && !result.requested.has(bid.event.id)) {
            result.requested.set(bid.event.id, bid);
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
export function request<P, V>(...args: Parameters<(event: Event<P, V>, payload: P| ((current?: P) => P) | ((current?: P) => Promise<P>), validate?: (nextValue: P) => BaseValidationReturn<V>) => Bid<P, V>>): RequestBid<P, V> {
    const event = args[0];
    return {
        type: "request",
        event,
        payload: args[1] as P,
        validate: args[2]
    };
}

/**
 * Creates a trigger bid
 * A trigger is a requesting an event to happen, but it needs another flow who is asking for the event.
 * It is like a request, but it is synced to another asking flow.
 * @param event the event that is about to be triggered
 * @param payload the next value of the event. or a function that return the next value of the event.
 * @param validate an optional validation function that can block the trigger if it tries to trigger an invalid value.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a trigger bid
 */
export function trigger<P, V>(...args: Parameters<(event: Event<P, V>, payload: P| ((current?: P) => P), validate?: (nextValue: P) => BaseValidationReturn<V>) => Bid<P, V>>): TriggerBid<P, V> {
    const event = args[0];
    const payload = args[1] as P;
    const validate = args[2];
    return { type: 'trigger', event, payload, validate };
}

/**
 * Creates an extend bid
 * An extend will create a pending event. The extending flow will hold this event pending, as long as it will set the event value ( by request, trigger or askFor bid )
 * An extend bid makes it possible for one flow to extend the behavior of another flow.
 * @param event the event that is about to be extended
 * @param validate an optional validation function that will allow the extend only for valid values.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns an extend bid
 */
export function extend<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (nextValue: P) => BaseValidationReturn<V>) => Bid<P, V>>): WaitingBid<P, V> {
    const event = args[0];
    const validate = args[1];
    return { type: 'extend', event, validate };
}

/**
 * Creates a waitFor bid
 * A flow with a waitFor bid will pause its progression until the waited for event is processed.
 * A waitFor is different from an askFor bid. It is a passive wait, that will simply wait for the event to happen. On the other hand, an askFor bid will ask for an external event or trigger to happen.
 * @param event the event that is about to be extended
 * @param validate an optional validation function that will allow the waitFor to be proceeded if the value is valid.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a waitFor bid
 */
 export function waitFor<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (value: P) => BaseValidationReturn<V>) => Bid<P, V>>): WaitingBid<P, V> {
    const event = args[0];
    const validate = args[1];
    return { type: 'waitFor', event, validate };
}

/**
 * Creates an askFor bid
 * A flow with an askFor bid will pause its progression until the waited for event is processed.
 * An askFor bid will ask for an external event or trigger to happen.
 * @param event the event that is about to be extended
 * @param validate an optional validation function that will allow the askFor to be proceeded if the value is valid.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns an askFor bid
 */
 export function askFor<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (nextValue: P) => BaseValidationReturn<V>) => Bid<P, V>>): WaitingBid<P, V> {
    const event = args[0];
    const validate = args[1];
    return { type: 'askFor', event, validate };
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
 export function block<P, V>(event: Event<P, V>, blockIf?: () => BaseValidationReturn<V>): BlockBid<P, V> {
    return { type: 'block', event, validate: blockIf };
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
 export function validate<P, V>(...args: Parameters<(event: Event<P, V>, validate: (nextValue: P) => BaseValidationReturn<V>) => Bid<P, V>>): ValidateBid<P, V> {
    return { type: 'validate', event: args[0] as Event<P,V>, validate: args[1] as (nextValue: P) => BaseValidationReturn<V> };
}

// BID UTILITY FUNCTIONS -------------------------------------------------------------------------------------------------------------

/**
 * utility function that will wait for all events to be processed, before proceeding.
 * @param bids bids that have to be progressed on, in order to advance the flow.
 * @remarks this utility function can be used to wait for all events that are passed as arguments.
 * @remarks needs to be prefixed by a yield* statement.
 */
export function* getAllValues(...bids: Bid<any, any>[]): FlowGenerator {
    while(bids && bids.filter(isProgressingBid).length > 0) {
        const [progressedEvent, remainingBids] = yield bids;
        bids = remainingBids || [];
    }
}

/**
 * utility function that will return a corretly typed value from a bid.
 * @param bid bid that is about to be progressed on, in order to advance the flow.
 * @remarks this utility function can be used to wait for all events that are passed as arguments.
 * @remarks needs to be prefixed by a yield* statement.
 */
export function* getEventValue<P, V>(bid: Bid<P, V>): Generator<TNext, P, FlowProgressInfo> {
    const x = yield bid;
    return x[0].value as P;
}

/**
 * utility function that will return a corretly typed value from a series of waitFor bids
 * @param bids bids that are about to be progressed on, in order to advance the flow.
 * @remarks this utility function can be used to wait for all events that are passed as arguments.
 * @remarks needs to be prefixed by a yield* statement.
 */
export function* getEventValues<P extends WaitingBid<any, any>[]>(...bids: P): Generator<TNext, {[K in keyof P]: P[K]["event"]["value"]}, FlowProgressInfo> {
    yield bids;
    return bids.map(bid => bid.event.value) as any;
}

/**
 * extend all events that are passed as the first argument.
 * this helper function will help in scenarios where the user will be hinted with a warning, before an action will be performed. ( like leaving an edit mode )
 * @param nestedEvents all events that are about to be extended
 * @param exclude events that should not be extended
 * @returns flow progress info
 */
export function* extendAll(nestedEvents: NestedEventObject[], exclude?: NestedEventObject[]): Generator<TNext, FlowProgressInfo, FlowProgressInfo> {
    const events = nestedEvents.map(nestedEventObject => getEvents(nestedEventObject)).flat();
    const excludeEvents = exclude?.map(nestedEventObject => getEvents(nestedEventObject)).flat();
    const progress = yield events.filter(event => !excludeEvents?.some(e => isSameTupleId(e.id, event.id))).map(event => extend(event));
    return progress;
}


// HELPERS -------------------------------------------------------------------------------------------------------------

/**
 * check if a bid is a request or trigger bid (requesting bid)
 * @returns true if the bid is a requesting bid
 */
function isRequestingBid(bid: Bid<unknown, unknown>): bid is PlacedRequestBid<unknown, unknown> | PlacedTriggerBid<unknown, unknown> {
    return bid.type === "trigger" || bid.type === "request";
}

/**
 * get initial event information
 * @returns initial event information
 */
function getInitialEventInformation<P,V>(event: Event<P, V>): EventInformation<P, V> {
    return {event, waitFor: [], askFor: [], extend: [], validate: [], block: [], request: [], trigger: []};
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
export function isSameBid(bid1: PlacedBid<any, any>, flowId: TupleId, bidId: number): boolean {
    return bid1.id === bidId && isSameTupleId(bid1.flow.id, flowId);
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

/**
 * returns true if the bid will advance because of an event
 * @param bid the bid to check
 * @returns true if the bid is a progressing bid ( a bid that is advanced because an event happened )
 * @internal
 */
function isProgressingBid(bid: Bid<any, any>): boolean {
    return bid.type !== 'block' && bid.type !== 'validate';
}