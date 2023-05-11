// BID UTILITY FUNCTIONS -------------------------------------------------------------------------------------------------------------

import { Bid, extend } from "./bid";
import { Event, NestedEventObject, getEvents } from "./event";
import { FlowProgressInfo, TNext } from "./flow";

/**
 * returns true if the bid will advance because of an event
 * @param bid the bid to check
 * @returns true if the bid is a progressing bid ( a bid that is advanced because an event happened )
 * @internal
 */
export function isProgressingBid(bid: Bid<any, any>): boolean {
    return bid.type !== 'block' && bid.type !== 'validate';
}

/**
 * utility function that will return all values from a series of bids (typed)
 * @param bid bid that is about to be progressed on, in order to advance the flow.
 * @remarks this utility function can be used to wait for all events that are passed as arguments.
 * @remarks needs to be prefixed by a yield* statement.
 */
export function* getAllValues<P extends Bid<any, any>[]>(...bids: P): Generator<TNext, {[K in keyof P]: P[K]["event"]["value"]}, FlowProgressInfo> {
    let bidsCopy = [...bids];
    
    while(bidsCopy && bidsCopy.filter(isProgressingBid).length > 1) {
        const [progressedEvent, remainingBids] = yield bidsCopy;
        bidsCopy = (remainingBids || []) as any;
    }
    if(bidsCopy.filter(isProgressingBid).length === 1) {
        const lastBid = bidsCopy.filter(isProgressingBid)[0];
        lastBid.isGetValueBid = true;
        const [progressedEvent] = yield bidsCopy;
    }
    return bids.map(bid => bid.event.value) as any;
}

/**
 * utility function that will return a correctly typed value from a bid.
 * @param bid bid that is about to be progressed on, in order to advance the flow.
 * @remarks this utility function can be used to wait for all events that are passed as arguments.
 * @remarks needs to be prefixed by a yield* statement.
 */
export function* getValue<P, V>(bid: Bid<P, V>): Generator<TNext, P, FlowProgressInfo> {
    bid.isGetValueBid = true;
    const x = yield bid;
    return x[0].value as P;
}

/**
 * utility function that will return a correctly typed value from a series of bids
 * @param bids bids that are about to be progressed on, in order to advance the flow.
 * @remarks this utility function can be used to wait for all events that are passed as arguments.
 * @remarks needs to be prefixed by a yield* statement.
 */
export function* getFirstValue<P extends Bid<any, any>[]>(...bids: P): Generator<TNext, {[K in keyof P]: P[K]["event"]["value"]}, FlowProgressInfo> {
    yield bids.map(bid => ({...bid, isGetValueBid: true} satisfies Bid<any, any>));
    return bids.map(bid => bid.event.value) as any;
}

/**
 * extend all events that are passed as the first argument.
 * this helper function will help in scenarios where the user will be hinted with a warning, before an action will be performed. ( like leaving an edit mode )
 * @param nestedEvents all events that are about to be extended
 * @param exclude events that should not be extended
 * @returns flow progress info
 *s @remarks needs to be prefixed by a yield* statement.

 */
export function* extendAll(nestedEvents: NestedEventObject[], validateFn?: (event: Event<any, any>) => boolean): Generator<TNext, FlowProgressInfo, FlowProgressInfo> {
    const events = nestedEvents.map(nestedEventObject => getEvents(nestedEventObject)).flat();
    const progress = yield events.map(event => extend(event, () => validateFn ? validateFn(event) : true));
    return progress;
}