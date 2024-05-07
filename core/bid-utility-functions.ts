// BID UTILITY FUNCTIONS -------------------------------------------------------------------------------------------------------------

import { AnyBid } from "./bid.ts";
import { FlowProgressInfo, TNext } from "./flow.ts";


export function* getAllValues<P extends AnyBid<any, any>[]>(...bids: P): Generator<TNext, {[K in keyof P]: P[K]["event"]["value"]}, FlowProgressInfo> {
    let bidsCopy = [...bids];
    while(bidsCopy && bidsCopy.length > 1) {
        const [progressedEvent, remainingBids] = yield bidsCopy;
        bidsCopy = (remainingBids || []) as any;
    }
    // the last bid is a getValueBid.
    if(bidsCopy.length === 1) {
        const lastBid = bidsCopy[0];
        const [progressedEvent] = yield bidsCopy;
    }
    return bids.map(bid => bid.event.value) as any;
}


export function* getValue<P, V>(bid: AnyBid<P, V>): Generator<TNext, P, FlowProgressInfo> {
    const x = yield bid;
    return x[0].value as P;
}
export const getEventValue = getValue;


export function* getFirstValue<P extends AnyBid<any, any>[]>(...bids: P): Generator<TNext, {[K in keyof P]: P[K]["event"]["value"]}, FlowProgressInfo> {
    yield bids.map(bid => ({...bid, isGetValueBid: true}));
    return bids.map(bid => bid.event.value) as {[K in keyof P]: P[K]["event"]["value"]};
}

/**
 * extend all events that are passed as the first argument.
 */
// export function* extendAll(nestedEvents: EventRecord[], validateFn?: (event: Event<any, any>) => boolean): Generator<TNext, FlowProgressInfo, FlowProgressInfo> {
//     const events = nestedEvents.map(nestedEventObject => Array.from(getEventMap(nestedEventObject).values())).flat();
//     const progress = yield events.map(event => extend(event, () => validateFn ? validateFn(event) : true));
//     return progress;
// }