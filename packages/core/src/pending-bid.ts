import { AnyAction } from "./action";
import { PlacedBid, BidType } from "./bid";
import { NameKeyId } from "./name-key-map";
import { ExtendContext } from "./extend-context";


export interface PendingBid extends PlacedBid {
    actionId: number;
    startTime: number;
    extendedRequestingBid?: {type: BidType, bThreadId: NameKeyId};
}

export function toExtendPendingBid(extendedAction: AnyAction, extendContext: ExtendContext, extendingNameKeyId: NameKeyId): PendingBid {
    return {
        actionId: extendedAction.id!,
        type: 'extendBid',
        bThreadId: extendingNameKeyId,
        extendedRequestingBid: (extendedAction.type === 'requestedAction') ? {
            type: extendedAction.bidType,
            bThreadId: extendedAction.bThreadId
        }: undefined,
        eventId: extendedAction.eventId,
        payload: extendContext.promise,
        startTime: new Date().getTime()
    }
}
