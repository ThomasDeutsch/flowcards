import { Bid, BidsByType, BidType, getMatchingBids, isBlocked } from './bid';
import { EventId } from './event-map';

export type Validation = (payload: any) => {isValid: boolean; details?: string} | boolean

type ValidationResultType = 'passed' | 'blocked' | 'noWait';

export type ValidationResult = {
    result: ValidationResultType;
    passed: any[]; 
    failed: any[];
}

export function isValid(validationReturn: {isValid: boolean; details?: string} | boolean) {
    if(validationReturn === true) return true;
    if(validationReturn === false) return false;
    if(validationReturn.isValid === true) return true;
    return false;
}

export function withValidPayload(bids: Bid[] | undefined, payload: any): boolean {
    return (bids !== undefined) && bids.some(bid => !bid.validate || isValid(bid.validate(payload)))
}

export function validate(bidsByType: BidsByType, event: EventId, payload: any): ValidationResultType {
    const matchingBids = getMatchingBids(bidsByType, [BidType.wait], event);
    if(matchingBids === undefined) return 'noWait';
    const somePassed = matchingBids.some(bid => {
        return !isBlocked(bidsByType, bid.event, {payload: payload}) &&
            (!bid.validate || bid.validate && isValid(bid.validate(payload)));
    });
    return somePassed ? 'passed' : 'blocked';
}
