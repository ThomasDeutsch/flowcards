import { Event } from "./event.ts";
import { BaseValidationReturn } from "./payload-validation.ts";
import { Flow, ExtendInformation, TNext } from "./flow.ts";
import { FlowProgressInfo, Engine } from "./index.ts";
import { FlowGeneratorFunction } from "./index.ts";

/**
 * with each yield or yield* statement, a flow can place bids.
 * A flow will only progress if one of the placed bids match the selected action.
 * There are 6 different types of bids:
 * given: a bid that will return a value, and will reset the flow if the value changes.
 * set: a bid that will request an event to happen. If the payload is a function that returns a promise, the flow will pause until the promise resolves.
 * when: a bid that will enable the event.dispatch(<value>).
 * extend: a bid that will intercept the current flow progression until the extending flow will resolve or abort the extend.
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
    given = "given",
    set = "set",
    when = "when",
    extend = "extend",
}

/**  a bid, that can be placed by a flow (has not been placed yet) */
interface Bid<P, V> {
    type: BidType;
    event: Event<P, V>;
}

export interface GivenBid<P, V> extends Bid<P, V> {
    type: BidType.given;
    isActive: boolean; // is this bid placed, or is it an active bid?
    validate?: (nextValue: P) => BaseValidationReturn<V>;
    equality?: (value: P) => unknown;
}

export interface WhenBid<P, V> extends Bid<P, V> {
    type: BidType.when;
    validate?: (nextValue: P) => BaseValidationReturn<V>;
    isGetValueBid: true;
}

export interface ExtendBid<P, V> extends Bid<P, V> {
    type: BidType.extend;
    validate?: (nextValue: P) => BaseValidationReturn<V>;
    extendingFlow: FlowGeneratorFunction;
}

export interface SetBid<P, V> extends Bid<P, V> {
    type: BidType.set;
    payload: P | ((current?: P) => P) | ((current?: P) => Promise<P>);
    validate?: (nextValue: P) => BaseValidationReturn<V>;
    isTriggerAskedFor?: true;
    isGetValueBid?: boolean;
}

/**
 * Union type for all bid types
 * export type AnyBid<P,V> = AskForBid<P,V> | WaitForBid<P,V> | ExtendBid<P,V> | RequestBid<P,V> | ValidateBid<P,V> | BlockBid<P,V>;
 */
export type AnyBid<P,V> = WhenBid<P,V> | ExtendBid<P,V> | SetBid<P,V> | GivenBid<P,V>;

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
    [BidType.set]?: Placed<SetBid<P, V>>[];
    [BidType.given]?: Placed<GivenBid<P, V>>[];
    [BidType.when]?: Placed<WhenBid<P, V>>[];
    [BidType.extend]?: Placed<ExtendBid<P, V>>[];
    pendingRequest?: Placed<SetBid<P,V>>;
    pendingExtend?: ExtendInformation<P,V>;
}

/**
 * Union type for all progressing bid types
 * A progressing bid is a bid that will advance the flow, because an event happened.
 * A block or validate bid will not advance the flow therefore it is not a progressing bid.
 */
export type ProgressingBid<P,V> = WhenBid<P,V> | ExtendBid<P,V> | SetBid<P,V>

/**
 * collected information about an event, and all requesting bids.
 * 1. all placed set bids (for all event-ids) that are ordered (first bid has the highest priority)
 * 2. for every event, the event information (see )
 * 3. for every event, a list of all active contexts (see PlacedContextBid)
 */
 export interface OrderedRequestsAndCurrentBids {
    orderedRequests: Placed<SetBid<any, any>>[];
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
        if(bid.type === 'set') {
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
    if(bidsAndPendingInformation.pendingExtends.length) {
        bidsAndPendingInformation.pendingExtends.forEach((extendInformation) => {
            const currentBids = result.currentBidsByEventId.get(extendInformation.event.id) ?? {event: extendInformation.event} satisfies CurrentBidsForEvent<any, any>;
            currentBids.pendingExtend = extendInformation;
            result.currentBidsByEventId.set(extendInformation.event.id, currentBids);
        });
    }
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
export function set<P, V>(...args: Parameters<(event: Event<P, V>, payload: P| ((current?: P) => P) | ((current?: P) => Promise<P>), validate?: (nextValue: P) => BaseValidationReturn<V>) => SetBid<P, V>>) {
    const event = args[0];
    return {
        type: BidType.set,
        event,
        payload: args[1] as P,
        validate: args[2]
    } satisfies SetBid<P, V>;
}

/**
 * Creates a request bid that can only progress if the event is waited for, by a when-bid.
 * @param event the event that is about to be requested
 * @param payload the payload is a value, a function that returns a value or a function that returns a promise.
 * @param validate an optional validation function that can block the request if it tries to set an invalid value.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a request bid
 */
export function trigger<P, V>(...args: Parameters<(event: Event<P, V>, payload: P| ((current?: P) => P) | ((current?: P) => Promise<P>), validate?: (nextValue: P) => BaseValidationReturn<V>) => SetBid<P, V>>) {
    const event = args[0];
    const payload = args[1] as P;
    const validate = args[2];
    return { type: BidType.set, event, payload, validate, isTriggerAskedFor: true } satisfies SetBid<P, V>;
}

/**
 * Creates an extend bid
 * An extend will create a pending extend. The extending flow will hold this event pending, until the extend is resolved or aborted.
 * An extend bid makes it possible for one flow to extend the behavior of another flow.
 * @param event the event that is about to be extended
 * @param validate an optional validation function that will allow the extend only for valid values.
 * @param rule a generator function that will return the value of the given bid
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns an extend bid
 */
export function extend<P, V>({event, validate, flow} : {event: Event<P, V>, validate?: (nextValue: P) => BaseValidationReturn<V>, flow: FlowGeneratorFunction}): ExtendBid<P, V> {
    return { type: BidType.extend, event, validate, extendingFlow: flow } satisfies ExtendBid<P, V>;
}

/**
 * Creates a given bid
 * if a flow progresses on a given bid, the flow will reset each time, the value of the validate function changes.
 * @param event the event that is about to be extended
 * @param validate an optional validation function. If the validation returns false, the flow will be disabled.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a generator function that will return the value of the given bid
 */
export function* given<P, V>(...args: Parameters<(event: Event<P, V>, options?: {validate?: (value: P) => BaseValidationReturn<V>, equality?: (value: P) => unknown}) => GivenBid<P, V>>) : Generator<TNext, P, FlowProgressInfo> {
    const event = args[0];
    const options = args[1];
    const bid = { type: BidType.given, event, validate: options?.validate, equality: options?.equality, isActive: false } satisfies GivenBid<P, V>;
    const [progressedEvent] = yield bid;
    return progressedEvent.value as P;
}

/**
 * Creates an when bid
 * A flow with an when bid will pause its progression until the waited for event is processed.
 * An when bid will ask for an external event or request to happen.
 * @param event the event that is enabled for the external event dispatch or request
 * @param validate an optional validation function that will allow the when to be proceeded if the value is valid.
 * @remarks this function will create a bid, that can only be placed by a flow when prefixed by a yield statement.
 * @returns a when bid
 */
 export function when<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (nextValue: P) => BaseValidationReturn<V>) => WhenBid<P, V>>) {
    const event = args[0];
    const validate = args[1];
    return { type: BidType.when, event, validate, isGetValueBid: true } satisfies WhenBid<P, V>;
}


// HELPERS -------------------------------------------------------------------------------------------------------------

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
    return remainingBids;
}

/**
 * @internal
 * from the current bids, get the highest priority When bid.
 * The highest priority When bid is the first When bid or the When bid placed by the extending flow.
 * @param currentBids current bids
 * @returns the highest priority When bid
 */
export function getHighestPriorityWhenBid(currentBids: CurrentBidsForEvent<any, any>): Placed<WhenBid<any, any>> | undefined {
    let highestPriorityAskForBid: Placed<WhenBid<any, any>> | undefined;
    // if the bid gets extended, the highest priority askFor bid is the askFor bid placed by the extending flow or the first askFor bid
    if(currentBids.when === undefined || currentBids.when.length === 0) return undefined
    const pendingExtend = currentBids.pendingExtend;
    if(pendingExtend?.extendingFlow) {
        highestPriorityAskForBid = currentBids.when.find(bid => bid.flow.id === pendingExtend.extendingFlow?.id);
    }
    if(highestPriorityAskForBid === undefined) {
        highestPriorityAskForBid = currentBids.when[0];
    }
    return highestPriorityAskForBid;
}