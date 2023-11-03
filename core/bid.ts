import { Event } from "./event.ts";
import { BaseValidationReturn } from "./payload-validation.ts";
import { AllBidsAndPendingInformation, Flow, PendingExtend, TNext } from "./flow.ts";
import { FlowProgressInfo, Engine } from "./index.ts";

/**
 * with each yield or yield* statement, a flow can place bids.
 * A flow will only progress if one of the placed bids match the selected action.
 * There are 6 different types of bids:
 * request: a bid that will request an event to happen. If the payload is a function that returns a promise, the flow will pause until the promise resolves.
 * askFor: a bid that will enable the event.dispatch(<value>).
 * waitFor: a bid that will pause the flow until the waited for event is processed.
 * extend: a bid that will intercept the current flow progression until the extending flow will resolve or abort the extend.
 * validate: a bid that will validate the event payload and prevent the flows to process if the payload is invalid.
 * block: a bid that will block the event. The event will not be processed by any flow.
 *
 * validate function:
 * the validate function will disable the bid if the validation result is invalid.
 * in case of a request bid with a promise payload, the validate function will be called with the resolved value.
 *
 * isGetValue flag:
 * if a flow progresses on a bid with a isGetValueBid flag, all sub-flows will be disabled, that are not enabled during the progression of this bid.
 */

/** the 6 bid types */
export enum BidType {
    request = "request",
    askFor = "askFor",
    waitFor = "waitFor",
    extend = "extend",
    validate = "validate",
    block = "block",
    given = "given"
}

/**  a bid, that can be placed by a flow (has not been placed yet) */
interface Bid<P, V> {
    type: BidType;
    event: Event<P, V>;
}

export interface AskForBid<P, V> extends Bid<P, V> {
    type: BidType.askFor;
    validate?: (nextValue: P) => BaseValidationReturn<V>;
    isGetValueBid?: boolean;
}

export interface WaitForBid<P, V> extends Bid<P, V> {
    type: BidType.waitFor;
    validate?: (nextValue: P) => BaseValidationReturn<V>;
    isGetValueBid?: boolean;
}

export interface GivenBid<P, V> extends Bid<P, V> {
    type: BidType.given;
    isActive: boolean; // is this bid placed, or is it an active bid?
    validate?: (nextValue: P) => BaseValidationReturn<V>;
}

export interface ExtendBid<P, V> extends Bid<P, V> {
    type: BidType.extend;
    validate?: (nextValue: P) => BaseValidationReturn<V>;
    isGetValueBid?: boolean;
}

export interface RequestBid<P, V> extends Bid<P, V> {
    type: BidType.request;
    payload: P | ((current?: P) => P) | ((current?: P) => Promise<P>);
    validate?: (nextValue: P) => BaseValidationReturn<V>;
    isTriggerAskedFor?: true;
    isGetValueBid?: boolean;
}

export interface ValidateBid<P, V> extends Bid<P, V> {
    type: BidType.validate;
    validate: (nextValue: P) => BaseValidationReturn<V>;
}

export interface BlockBid<P, V> extends Bid<P, V> {
    type: BidType.block;
    validate?: () => BaseValidationReturn<V>;
}

/**
 * Union type for all bid types
 * export type AnyBid<P,V> = AskForBid<P,V> | WaitForBid<P,V> | ExtendBid<P,V> | RequestBid<P,V> | ValidateBid<P,V> | BlockBid<P,V>;
 */
export type AnyBid<P,V> = AskForBid<P,V> | WaitForBid<P,V> | ExtendBid<P,V> | RequestBid<P,V> | ValidateBid<P,V> | BlockBid<P,V> | GivenBid<P,V>;

/**
 * a placed bid is a bid that has been placed by a flow.
 * a placed bid are the currently active bids in the event information (known to the engine)
 */
export type Placed<B extends AnyBid<any, any>> = B & {
    id: number;
    flow: Flow;
    requestActionId?: number;
}

/**
 * all placed bids and pending information for an event
 */
export interface CurrentBidsForEvent<P, V> {
    event: Event<P,V>;
    [BidType.request]?: Placed<RequestBid<P, V>>[];
    [BidType.waitFor]?: Placed<WaitForBid<P, V>>[];
    [BidType.given]?: Placed<GivenBid<P, V>>[];
    [BidType.askFor]?: Placed<AskForBid<P, V>>[];
    [BidType.extend]?: Placed<ExtendBid<P, V>>[];
    [BidType.validate]?: Placed<ValidateBid<P, V>>[];
    [BidType.block]?: Placed<BlockBid<P,V>>[];
    pendingRequest?: Placed<RequestBid<P,V>>;
    pendingExtend?: PendingExtend<P,V>;
}

/**
 * Union type for all progressing bid types
 * A progressing bid is a bid that will advance the flow, because an event happened.
 * A block or validate bid will not advance the flow therefore it is not a progressing bid.
 */
export type ProgressingBid<P,V> = AskForBid<P,V> | WaitForBid<P,V> | ExtendBid<P,V> | RequestBid<P,V>

/**
 * collected information about an event, and all requesting bids.
 * 1. all placed request bids (for all event-ids) that are ordered (first bid has the highest priority)
 * 2. for every event, the event information (see )
 * 3. for every event, a list of all active contexts (see PlacedContextBid)
 */
 export interface OrderedRequestsAndCurrentBids {
    orderedRequests: Placed<RequestBid<any, any>>[];
    currentBidsByEventId: Map<string, CurrentBidsForEvent<any, any>>;
}

// CORE FUNCTIONS -----------------------------------------------------------------------------------------------

/**
 * organizes all bids and pending information into a new data structure that is more performant to use for the engine.
 * @param fb the information about all placed bids and pending information
 * @returns collected information about all events and pending requests and extends
 * @internal
 */
export function getOrderedRequestsAndCurrentBids(engine: Engine): OrderedRequestsAndCurrentBids {
    const bidsAndPendingInformation = engine.rootFlow.__getBidsAndPendingInformation();
    const result: OrderedRequestsAndCurrentBids = {
        orderedRequests: [],
        currentBidsByEventId: new Map(),
    };
    // 1. add all placed bids to the result
    bidsAndPendingInformation.placedBids.forEach(bid => {
        if(bid.event.rootFlowId === undefined) {
            engine.__connectEventToEngine(bid.event); // connect the event to the engine, if it is not connected yet
        } else if(bid.event.rootFlowId !== bid.flow.pathFromRootFlow[0]) return; // only add bids that are placed by the root flow (the flow that placed the event)
        if(isRequestBid(bid)) {
            result.orderedRequests = [...result.orderedRequests , bid];
        }
        const currentBids = result.currentBidsByEventId.get(bid.event.id) || {event: bid.event} satisfies CurrentBidsForEvent<any, any>;
        if(currentBids[bid.type] === undefined) currentBids[bid.type] = [bid as any];
        else {
            currentBids[bid.type]?.push(bid as any); // TODO: find a better type solution ( mapped types? )
        }
        result.currentBidsByEventId.set(bid.event.id, currentBids);
    });
    // 2. add pending request information to the result
    bidsAndPendingInformation.pendingRequests?.forEach((pendingRequest, eventId) => {
        const currentBids = result.currentBidsByEventId.get(eventId) ?? {event: pendingRequest.event} satisfies CurrentBidsForEvent<any, any>;
        currentBids.pendingRequest = pendingRequest;
        result.currentBidsByEventId.set(eventId, currentBids);
    });
    // 3. add pending extend information to the result
    bidsAndPendingInformation.pendingExtends?.forEach((pendingExtend, eventId) => {
        const currentBids = result.currentBidsByEventId.get(eventId) ?? {event: pendingExtend.event} satisfies CurrentBidsForEvent<any, any>;
        currentBids.pendingExtend = pendingExtend;
        result.currentBidsByEventId.set(eventId, currentBids);
    });
    return result;
}


// API -------------------------------------------------------------------------------------------------------------

/**
 * Creates a request bid
 * A request bid is a bid that requests an event to happen.
 * @param event the event that is requested
 * @param payload the payload is a value, a function that returns a value or a function that returns a promise.
 * @param validate an optional payload validation function.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a request bid
 */
export function request<P, V>(...args: Parameters<(event: Event<P, V>, payload: P| ((current?: P) => P) | ((current?: P) => Promise<P>), validate?: (nextValue: P) => BaseValidationReturn<V>) => RequestBid<P, V>>) {
    const event = args[0];
    return {
        type: BidType.request,
        event,
        payload: args[1] as P,
        validate: args[2]
    } satisfies RequestBid<P, V>;
}

/**
 * Creates a request bid that can only progress if the event is asked for.
 * @param event the event that is about to be requested
 * @param payload the payload is a value, a function that returns a value or a function that returns a promise.
 * @param validate an optional validation function that can block the request if it tries to set an invalid value.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a request bid
 */
export function trigger<P, V>(...args: Parameters<(event: Event<P, V>, payload: P| ((current?: P) => P) | ((current?: P) => Promise<P>), validate?: (nextValue: P) => BaseValidationReturn<V>) => RequestBid<P, V>>) {
    const event = args[0];
    const payload = args[1] as P;
    const validate = args[2];
    return { type: BidType.request, event, payload, validate, isTriggerAskedFor: true } satisfies RequestBid<P, V>;
}

/**
 * Creates an extend bid
 * An extend will create a pending extend. The extending flow will hold this event pending, until the extend is resolved or aborted.
 * An extend bid makes it possible for one flow to extend the behavior of another flow.
 * @param event the event that is about to be extended
 * @param validate an optional validation function that will allow the extend only for valid values.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns an extend bid
 */
export function extend<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (nextValue: P) => BaseValidationReturn<V>) => ExtendBid<P, V>>) {
    const event = args[0];
    const validate = args[1];
    return { type: BidType.extend, event, validate } satisfies ExtendBid<P, V>;
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
 export function waitFor<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (value: P) => BaseValidationReturn<V>) => WaitForBid<P, V>>) {
    const event = args[0];
    const validate = args[1];
    return { type: BidType.waitFor, event, validate } satisfies WaitForBid<P, V>;
}

/**
 * Creates a given bid
 * if a flow progresses on a given bid, the flow will reset each time, the value of the validate function changes.
 * @param event the event that is about to be extended
 * @param validate an optional validation function. If the validation returns false, the flow will be disabled.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a generator function that will return the value of the given bid
 */
export function* given<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (value: P) => BaseValidationReturn<V>) => GivenBid<P, V>>) : Generator<TNext, P, FlowProgressInfo> {
    const event = args[0];
    const validate = args[1];
    const bid = { type: BidType.given, event, validate, isActive: false } satisfies GivenBid<P, V>;
    const [progressedEvent] = yield bid;
    return progressedEvent.value as P;
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
 export function askFor<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (nextValue: P) => BaseValidationReturn<V>) => AskForBid<P, V>>) {
    const event = args[0];
    const validate = args[1];
    return { type: BidType.askFor, event, validate } satisfies AskForBid<P, V>;
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
 export function block<P, V>(event: Event<P, V>, blockIf?: () => BaseValidationReturn<V>): BlockBid<P,V> {
    return { type: BidType.block, event, validate: blockIf } satisfies BlockBid<P, V>;
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
 export function validate<P, V>(...args: Parameters<(event: Event<P, V>, validate: (nextValue: P) => BaseValidationReturn<V>) => ValidateBid<P, V>>) {
    return { type: BidType.validate, event: args[0] as Event<P,V>, validate: args[1] as (nextValue: P) => BaseValidationReturn<V> } satisfies ValidateBid<P, V>;
}


// HELPERS -------------------------------------------------------------------------------------------------------------

/**
 * check if a bid is a request bid (requesting bid)
 * @returns true if the bid is a requesting bid
 */
function isRequestBid(bid: Placed<AnyBid<unknown, unknown>>): bid is Placed<RequestBid<unknown, unknown>> {
    return bid.type === "request";
}


/**
 * helper function to guarantee a Bid[] return type if the input is not undefined
 * @param next a next value of a flow generator
 * @returns an array of bids/placed bids or undefined
 */
 export function toBids(next?: TNext | void): (AnyBid<unknown, unknown>)[] | undefined {
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
export function isSameBid(bid1: Placed<AnyBid<any, any>>, flowId: string, bidId: number): boolean {
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
export function filterRemainingBids(bidId: number, placedBids?: Placed<AnyBid<any, any>>[]): Placed<AnyBid<any, any>>[] | undefined {
    if(placedBids === undefined) return undefined;
    const remainingBids = placedBids.filter(bid => bid.id !== bidId);
    if(remainingBids.length === 0) {
        return undefined;
    }
    return remainingBids.every(bid => bid.type === "validate" || bid.type === "block") ? undefined : remainingBids;
}

/**
 * @internal
 * from the current bids, get the highest priority askFor bid.
 * The highest priority askFor bid is the first askFor bid or the askFor bid placed by the extending flow.
 * @param currentBids current bids
 * @returns the highest priority askFor bid
 */
export function getHighestPriorityAskForBid(currentBids: CurrentBidsForEvent<any, any>): Placed<AskForBid<any, any>> | undefined {
    let highestPriorityAskForBid: Placed<AskForBid<any, any>> | undefined;
    // if the bid gets extended, the highest priority askFor bid is the askFor bid placed by the extending flow or the first askFor bid
    if(currentBids.askFor === undefined || currentBids.askFor.length === 0) return undefined
    const pendingExtend = currentBids.pendingExtend;
    if(pendingExtend !== undefined) {
        highestPriorityAskForBid = currentBids.askFor.find(askForBid => askForBid.flow.id === pendingExtend.extendingFlow.id);
    }
    if(highestPriorityAskForBid === undefined) {
        highestPriorityAskForBid = currentBids.askFor[0];
    }
    return highestPriorityAskForBid;
}