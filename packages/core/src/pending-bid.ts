import { BThreadId } from "./bthread";
import { ActionType, AnyAction } from "./action";
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
        extendedRequestingBid: (extendedAction.type === ActionType.requested) ? {
            type: extendedAction.bidType,
            eventId: extendedAction.eventId,
            bThreadId: extendedAction.bThreadId
        }: undefined,
        eventId: extendedAction.eventId,
        payload: extendContext.promise
    }
}