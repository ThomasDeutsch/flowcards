import { BThreadId } from "./bthread";
import { AnyAction, isRequestedAction } from "./action";
import { PlacedBid, BidType } from "./bid";
import { ExtendContext } from "./extend-context";


export interface PendingBid extends PlacedBid {
    actionId: number;
    extendedRequestingBid?: PlacedBid;
}

export function getExtendPendingBid(extendedAction: AnyAction, extendContext: ExtendContext, extendingBThreadId: BThreadId): PendingBid {
    return {
        actionId: extendedAction.id!,
        type: BidType.extend,
        bThreadId: extendingBThreadId,
        extendedRequestingBid: isRequestedAction(extendedAction) ? {
            type: extendedAction.bidType,
            eventId: extendedAction.eventId,
            bThreadId: extendedAction.bThreadId
        }: undefined,
        eventId: extendedAction.eventId,
        payload: extendContext.promise
    }
}