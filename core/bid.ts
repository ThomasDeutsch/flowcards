import { Event } from "./event.ts";
import { BaseValidationReturn } from "./payload-validation.ts";
import { Rule, ExtendInformation, TNext } from "./rule.ts";
import { RuleProgressInfo, Engine } from "./index.ts";
import { RuleGeneratorFunction } from "./index.ts";


// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

export enum BidType {
    given = "given",
    set = "set",
    when = "when",
    extend = "extend",
}

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
    extendingRule: RuleGeneratorFunction;
}

export interface SetBid<P, V> extends Bid<P, V> {
    type: BidType.set;
    payload: P | ((current?: P) => P) | ((current?: P) => Promise<P>);
    validate?: (nextValue: P) => BaseValidationReturn<V>;
    isTrigger?: true;
    isGetValueBid?: boolean;
}

export type AnyBid<P,V> = WhenBid<P,V> | ExtendBid<P,V> | SetBid<P,V> | GivenBid<P,V>;

export type Placed<B extends AnyBid<any, any>> = B & {
    id: number;
    rule: Rule;
    requestActionId?: number;
}

export interface CurrentBidsForEvent<P, V> {
    event: Event<P,V>;
    [BidType.set]?: Placed<SetBid<P, V>>[];
    [BidType.given]?: Placed<GivenBid<P, V>>[];
    [BidType.when]?: Placed<WhenBid<P, V>>[];
    [BidType.extend]?: Placed<ExtendBid<P, V>>[];
    pendingRequest?: Placed<SetBid<P,V>>;
    pendingExtend?: ExtendInformation<P,V>;
}

export type ProgressingBid<P,V> = WhenBid<P,V> | ExtendBid<P,V> | SetBid<P,V>

 export interface OrderedRequestsAndCurrentBids {
    orderedRequests: Placed<SetBid<any, any>>[];
    currentBidsByEventId: Map<string, CurrentBidsForEvent<any, any>>;
}


// CORE FUNCTIONS -----------------------------------------------------------------------------------------------

export function getOrderedRequestsAndCurrentBids(engine: Engine): OrderedRequestsAndCurrentBids {
    const bidsAndPendingInformation = engine.rootRule.__getBidsAndPendingInformation();
    const result: OrderedRequestsAndCurrentBids = {
        orderedRequests: [],
        currentBidsByEventId: new Map(),
    };
    // 1. add all placed bids to the result
    bidsAndPendingInformation.placedBids.forEach(bid => {
        if(bid.event.rootRuleId === undefined) {
            engine.__connectEventToEngine(bid.event); // connect the event to the engine, if it is not connected yet
        } else if(bid.event.rootRuleId !== bid.rule.pathFromRootRule[0]) return; // only add bids that are placed by the root rule (the rule that placed the event)
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

export function set<P, V>(...args: Parameters<(event: Event<P, V>, payload: P| ((current?: P) => P) | ((current?: P) => Promise<P>), validate?: (nextValue: P) => BaseValidationReturn<V>) => SetBid<P, V>>) {
    const event = args[0];
    return {
        type: BidType.set,
        event,
        payload: args[1] as P,
        validate: args[2]
    } satisfies SetBid<P, V>;
}

export function trigger<P, V>(...args: Parameters<(event: Event<P, V>, payload: P| ((current?: P) => P) | ((current?: P) => Promise<P>), validate?: (nextValue: P) => BaseValidationReturn<V>) => SetBid<P, V>>) {
    const event = args[0];
    const payload = args[1] as P;
    const validate = args[2];
    return { type: BidType.set, event, payload, validate, isTrigger: true } satisfies SetBid<P, V>;
}

export function extend<P, V>({event, validate, rule} : {event: Event<P, V>, validate?: (nextValue: P) => BaseValidationReturn<V>, rule: RuleGeneratorFunction}): ExtendBid<P, V> {
    return { type: BidType.extend, event, validate, extendingRule: rule } satisfies ExtendBid<P, V>;
}

export function* given<P, V>(...args: Parameters<(event: Event<P, V>, options?: {validate?: (value: P) => BaseValidationReturn<V>, equality?: (value: P) => unknown}) => GivenBid<P, V>>) : Generator<TNext, P, RuleProgressInfo> {
    const event = args[0];
    const options = args[1];
    const bid = { type: BidType.given, event, validate: options?.validate, equality: options?.equality, isActive: false } satisfies GivenBid<P, V>;
    const [progressedEvent] = yield bid;
    return progressedEvent.value as P;
}

export function when<P, V>(...args: Parameters<(event: Event<P, V>, validate?: (nextValue: P) => BaseValidationReturn<V>) => WhenBid<P, V>>) {
    const event = args[0];
    const validate = args[1];
    return { type: BidType.when, event, validate, isGetValueBid: true } satisfies WhenBid<P, V>;
}




// HELPERS -------------------------------------------------------------------------------------------------------------

 export function toBids(next?: TNext | void): (AnyBid<unknown, unknown>)[] | undefined {
    if(next === undefined) return undefined;
    if (Array.isArray(next)) {
        return next;
    } else {
        return [next];
    }
}

export function isSameBid(bid1: Placed<AnyBid<any, any>>, ruleId: string, bidId: number): boolean {
    return (bid1.id === bidId) && (bid1.rule.id === ruleId);
}

export function filterRemainingBids(bidId: number, placedBids?: Placed<AnyBid<any, any>>[]): Placed<AnyBid<any, any>>[] | undefined {
    if(placedBids === undefined) return undefined;
    const remainingBids = placedBids.filter(bid => bid.id !== bidId);
    if(remainingBids.length === 0) {
        return undefined;
    }
    return remainingBids;
}

export function getHighestPriorityWhenBid(currentBids: CurrentBidsForEvent<any, any>): Placed<WhenBid<any, any>> | undefined {
    let highestPriorityAskForBid: Placed<WhenBid<any, any>> | undefined;
    // if the bid gets extended, the highest priority askFor bid is the askFor bid placed by the extending rule or the first askFor bid
    if(currentBids.when === undefined || currentBids.when.length === 0) return undefined
    const pendingExtend = currentBids.pendingExtend;
    if(pendingExtend?.extendingRule) {
        highestPriorityAskForBid = currentBids.when.find(bid => bid.rule.id === pendingExtend.extendingRule?.id);
    }
    if(highestPriorityAskForBid === undefined) {
        highestPriorityAskForBid = currentBids.when[0];
    }
    return highestPriorityAskForBid;
}