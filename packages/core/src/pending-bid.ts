import { BThreadId } from "./bthread";
import { ActionType, AnyAction } from "./action";
import { PlacedBid, BidType } from "./bid";
import { ExtendContext } from "./extend-context";


export interface PendingBid extends PlacedBid {
    actionId: number;
    extendedRequestingBid?: PlacedBid;
}

export function toExtendPendingBid(extendedAction: AnyAction, extendContext: ExtendContext, extendingBThreadId: BThreadId): PendingBid {
    return {
        actionId: extendedAction.id!,
        type: 'extendBid',
        bThreadId: extendingBThreadId,
        extendedRequestingBid: (extendedAction.type === 'requestedAction') ? {
            type: extendedAction.bidType,
            eventId: extendedAction.eventId,
            bThreadId: extendedAction.bThreadId
        }: undefined,
        eventId: extendedAction.eventId,
        payload: extendContext.promise
    }
}