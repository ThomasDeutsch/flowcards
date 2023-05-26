// BID UTILITY FUNCTIONS -------------------------------------------------------------------------------------------------------------

import { AnyBid, AskForBid, ExtendBid, RequestBid, WaitForBid, extend } from "./bid.ts";
import { Event } from "./event.ts";
import { FlowProgressInfo, TNext } from "./flow.ts";
import { EventRecord, getAllEvents } from "./utils.ts";

/**
 * returns true if the bid will advance because of an event
 * @param bid the bid to check
 * @returns true if the bid is a progressing bid ( a bid that is advanced because an event happened )
 * @internal
 */
export function isProgressingBid(bid: AnyBid<any, any>): bid is RequestBid<any, any> | WaitForBid<any, any> | AskForBid<any, any> | ExtendBid<any, any> {
    return bid.type !== 'block' && bid.type !== 'validate';
}

/**
 * utility function that will return all values from a series of bids (typed)
 * @param bid bid that is about to be progressed on, in order to advance the flow.
 * @remarks will set the last progressed bid to a getValueBid. If a getValueBid is progressed, all subFlows that are not enabled will be disabled.
 * @remarks this utility function can be used to wait for all events that are passed as arguments.
 * @remarks needs to be prefixed by a yield* statement.
 */
export function* getAllValues<P extends AnyBid<any, any>[]>(...bids: P): Generator<TNext, {[K in keyof P]: P[K]["event"]["value"]}, FlowProgressInfo> {
    let bidsCopy = [...bids];
    while(bidsCopy && bidsCopy.filter(isProgressingBid).length > 1) {
        const [progressedEvent, remainingBids] = yield bidsCopy;
        bidsCopy = (remainingBids || []) as any;
    }
    // the last bid is a getValueBid.
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
 * @remarks will set the bid to a getValueBid. If a getValueBid is progressed, all subFlows that are not enabled will be disabled.
 * @remarks needs to be prefixed by a yield* statement.
 */
export function* getValue<P, V>(bid: ExtendBid<P, V> | WaitForBid<P,V> | AskForBid<P,V> | RequestBid<P,V>): Generator<TNext, P, FlowProgressInfo> {
    bid.isGetValueBid = true;
    const x = yield bid;
    return x[0].value as P;
}

/**
 * utility function that will return a correctly typed value from a series of bids
 * @param bids bids that are about to be progressed on, in order to advance the flow.
 * @remarks will set the progressed bid to a getValueBid. If a getValueBid is progressed, all subFlows that are not enabled will be disabled.
 * @remarks this utility function can be used to wait for all events that are passed as arguments.
 * @remarks needs to be prefixed by a yield* statement.
 */
export function* getFirstValue<P extends AnyBid<any, any>[]>(...bids: P): Generator<TNext, {[K in keyof P]: P[K]["event"]["value"]}, FlowProgressInfo> {
    yield bids.map(bid => isProgressingBid(bid) ? {...bid, isGetValueBid: true} : bid);
    return bids.map(bid => bid.event.value) as {[K in keyof P]: P[K]["event"]["value"]};
}

/**
 * extend all events that are passed as the first argument.
 * this helper function will help in scenarios where the user will be hinted with a warning, before an action will be performed. ( like leaving an edit mode )
 * @param nestedEvents all events that are about to be extended
 * @param validateFn optional function that will be called to check if the event should be extended or not
 * @returns flow progress info
 * @remarks needs to be prefixed by a yield* statement.
 */
export function* extendAll(nestedEvents: EventRecord[], validateFn?: (event: Event<any, any>) => boolean): Generator<TNext, FlowProgressInfo, FlowProgressInfo> {
    const events = nestedEvents.map(nestedEventObject => getAllEvents(nestedEventObject)).flat();
    const progress = yield events.map(event => extend(event, () => validateFn ? validateFn(event) : true));
    return progress;
}