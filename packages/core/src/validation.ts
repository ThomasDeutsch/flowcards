import { Bid, ActiveBidsByType, BidType, getMatchingBids, isBlocked } from './bid';
import { EventId } from './event-map';

export type Validation = (payload: any) => {isValid: boolean; details?: string} | boolean

export type ValidationResultType = 'passed' | 'blocked' | 'noWait';

export function isValid(validationReturn: {isValid: boolean; details?: string} | boolean) {
    if(validationReturn === true) return true;
    if(validationReturn === false) return false;
    if(validationReturn.isValid === true) return true;
    return false;
}

export function withValidPayload(bids: Bid[] | undefined, payload: any): boolean {
    return (bids !== undefined) && bids.some(bid => !bid.validate || isValid(bid.validate(payload)))
}

export function validate(activeBidsByType: ActiveBidsByType, event: EventId, payload: any): ValidationResultType {
    const matchingBids = getMatchingBids(activeBidsByType, [BidType.wait], event);
    if(matchingBids === undefined) return 'noWait';
    const somePassed = matchingBids.some(bid => {
        return !isBlocked(activeBidsByType, bid.eventId, {payload: payload}) &&
            (!bid.validate || bid.validate && isValid(bid.validate(payload)));
    });
    return somePassed ? 'passed' : 'blocked';
}