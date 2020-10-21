import { Bid, ActiveBidsByType, BidType, getMatchingBids, isBlocked } from './bid';
import { EventId } from './event-map';

export type Validation = (payload: any) => {isValid: boolean; message?: string} | boolean

export function isValid(bid: Bid, payload?: any) {
    if(!bid.validate) return true;
    const validationReturn = bid.validate(payload);
    if(validationReturn === true) return true;
    if(validationReturn === false) return false;
    if(validationReturn.isValid === true) return true;
    return false;
}

export function withValidPayload(bids: Bid[] | undefined, payload: any): boolean {
    return (bids !== undefined) && bids.some(bid => isValid(bid, payload))
}

export interface ValidateResult {
    isValid: boolean;
    hasGlobalWait: boolean;
    passed: BidAndMessage[];
    failed: BidAndMessage[];
}

type BidAndMessage = { bid: Bid; message?: string };

function getBidAndMessage(bid: Bid, validateResult?: {isValid: boolean; message?: string} | boolean): BidAndMessage {
    if(typeof validateResult === 'object') {
        return {bid: bid, message: validateResult.message};
    }
    return {bid: bid}
}


export function validate(activeBidsByType: ActiveBidsByType, event: EventId, payload: any): ValidateResult | undefined {
    const bids = activeBidsByType[BidType.wait]?.get(event)
    if(bid === undefined) return undefined;
    const blocks = getMatchingBids(activeBidsByType, [BidType.block], event);
    const passed = [];
    const failed = [];
    if(isValid(bid, payload)) {
        passed.push(getBidAndMessage(bid, bid.validate?.(payload)));
    } else {
        failed.push(getBidAndMessage(bid, bid.validate?.(payload)))
    }
    blocks?.forEach(block => {
        if(isValid(block, payload)) failed.push(getBidAndMessage(block, block.validate?.(payload)));
        else passed.push(getBidAndMessage(block, block.validate?.(payload)));
    });
    return {
        isValid: failed.length === 0 && !isBlocked(activeBidsByType, event),
        hasGlobalWait: activeBidsByType[BidType.wait]?.get({name: event.name}) !== undefined,
        passed: passed,
        failed: failed,
    }
}
