import { AnyAction } from "./action";
import { PlacedBid, BidType } from "./bid";
import { NameKeyId } from "./name-key-map";
import { ExtendContext } from "./extend-context";


export interface PendingBid extends Omit<PlacedBid, 'payload'> {
    actionId: number;
    startTime: number;
    extendedRequestingBThreadId?: NameKeyId;
    extendedBidType?: BidType;
    payload?: Promise<any>;
    extendedPayload?: any;
}

export function toExtendPendingBid(extendedAction: AnyAction, extendContext: ExtendContext, extendingBThreadId: NameKeyId): PendingBid {
    let bThreadId: NameKeyId | undefined;
    let extendedBidType: BidType | undefined;
    if(extendedAction.type === 'requestedAction') {
        extendedBidType =  extendedAction.bidType;
        bThreadId = extendedAction.bThreadId
    } else if(extendedAction.type === 'resolveAction') {
        extendedBidType = extendedAction.resolvedRequestingBid.type;
        bThreadId = extendedAction.resolvedRequestingBid?.bThreadId
    }
    return {
        actionId: extendedAction.id!,
        type: 'extendBid',
        bThreadId: extendingBThreadId,
        extendedRequestingBThreadId: bThreadId,
        eventId: extendedAction.eventId,
        extendedPayload: extendedAction.payload,
        extendedBidType: extendedBidType,
        payload: extendContext.promise,
        startTime: new Date().getTime()
    }
}
