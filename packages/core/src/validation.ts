import { PlacedBid, BidType } from './bid';
import { EventId } from './event-map';
import { getProgressingBids } from './advance-bthreads';
import { ActionType, AllPlacedBids, AnyAction, getHighestPrioAskForBid, PlacedBidContext } from '.';


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

export type ValidationErrors = any[] | false;
export type ValidateCB = (payload?: any, schemas?: any) => true | ValidationErrors;
export type ValidateCheck = (payload?: any) => true | ValidationErrors;

export function getValidateCheck(bid?: PlacedBid, bidContext?: PlacedBidContext): ValidateCheck {
    const errors: any[] = [];
    bidContext?.blockedBy?.forEach(bid => { 
        if(bid.error) errors.push(bid.error)
    })
    if(bid === undefined) errors.push('Event was not asked for');
    if(errors.length > 0) return (payload?: any) => errors;
    if(bid && bid.validateCB === undefined) return (payload?: any) => true;
    return (payload) => bid!.validateCB!(payload, [bid!.schema, ...(bidContext?.validatedBy || [])]);
}

export function validateAskedFor(action: AnyAction, allPlacedBids: AllPlacedBids): UIActionCheck {
    // add validation for trigger!!!
    if(action.type !== ActionType.ui) return UIActionCheck.OK;
    const eventContext = allPlacedBids.get(action.eventId);
    if(eventContext === undefined) return UIActionCheck.NoPlacedBidForEventId;
    if(eventContext.blockedBy) return UIActionCheck.EventIsBlocked;
    if(eventContext.pendingBy) return UIActionCheck.EventIsPending;
    // re-check the dispatched action, because this action comes from a buffer, it could be that the user was able
    // to dispatch, but another action may caused BThread changes.
    const askForBid = getHighestPrioAskForBid(allPlacedBids, action.eventId, action); //TODO: validate trigger payload
    if(askForBid === undefined) return UIActionCheck.NoMatchingAskForBid;
    //TODO: askForBid?.validate(action.payload);
    return UIActionCheck.OK
}


export function checkPayload(bid: PlacedBid, payload: unknown): true | ValidationErrors {
    if(bid.validateCB) return bid.validateCB(payload, [bid.schema]);
    return true;
}