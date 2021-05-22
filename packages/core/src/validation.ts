import { PlacedBid } from './bid';
import { ActionType, AllPlacedBids, AnyAction, BidType, getHighestPrioAskForBid, PlacedBidContext } from '.';


export enum UIActionCheck {
    OK = 'OK',  
    EventIsBlocked = 'EventIsBlocked',
    EventIsPending = 'EventIsPending',
    HasInvalidPayload = 'HasInvalidPayload',
    NoPlacedBidForEventId = 'NoPlacedBidForEventId',
    NoMatchingAskForBid = 'NoMatchingAskForBid'
}

export enum ReactionCheck {
    OK = 'OK',
    ExtendingBThreadNotFound = 'ExtendingBThreadNotFound',
    RequestingBThreadNotFound = 'RequestingBThreadNotFound',
    BThreadWithoutMatchingBid = 'BThreadWithoutMatchingBid',
    EventWasCancelled = 'EventWasCancelled',
    PendingBidNotFound = 'PendingBidNotFound',
    ExtendedRequestingBThreadNotFound = "ExtendedRequestingBThreadNotFound",
}

export type ValidateReturn<T> = boolean | {isValid: boolean, details?: T};
export type ValidateCB<T = void> = (payload?: any) => ValidateReturn<T>;


function isValidReturn(val: ValidateReturn<unknown>): boolean {
    return val === true || (typeof val === 'object' && val.isValid === true);
}


export function combinedIsValidCB(bid?: PlacedBid, bidContext?: PlacedBidContext): (payload?: any) => {isValid: boolean} {
    // TODO: add passing and failing details to result!
    //       also include the 3 extra cases - no match, isBlocked, pending
    if(bid === undefined || bidContext === undefined) return (payload?: any) => ({isValid: false, details: ['no matching bid found']});
    if(bidContext.blockedBy) return (payload?: any) => ({isValid: false, details: ['event is blocked']});
    if(bidContext.pendingBy) return (payload?: any) => ({isValid: false, details: ['event is pending by BThread ' + bidContext.pendingBy]});
    const bidValidation = bid.validateCB || ((payload?: any) => ({isValid: true}));
    return (payload) => {
        return {
            isValid: isValidReturn(bidValidation(payload)) && (bidContext.validatedBy === undefined || bidContext.validatedBy.every(vb => isValidReturn(vb.validateCB!(payload)))),

        };
    }
}

export function validateAskedFor(action: AnyAction, allPlacedBids: AllPlacedBids): UIActionCheck {
    if((action.type === ActionType.requested && action.bidType !== BidType.trigger) || 
      (action.type !== ActionType.ui)) return UIActionCheck.OK;
    const bidContext = allPlacedBids.get(action.eventId);
    if(bidContext === undefined) return UIActionCheck.NoPlacedBidForEventId;
    if(bidContext.blockedBy) return UIActionCheck.EventIsBlocked;
    if(bidContext.pendingBy) return UIActionCheck.EventIsPending;
    // re-check the dispatched action, because this action comes from a buffer, it could be that the user was able
    // to dispatch, but another action may caused BThread changes.
    const askForBid = getHighestPrioAskForBid(allPlacedBids, action.eventId, action);
    if(askForBid === undefined) return UIActionCheck.NoMatchingAskForBid;
    return UIActionCheck.OK
}