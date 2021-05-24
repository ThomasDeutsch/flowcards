import { PlacedBid } from './bid';
import { ActionType, AllPlacedBids, AnyAction, BidType, getHighestPrioAskForBid, PlacedBidContext } from '.';
import { notUndefined } from './utils';


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

export type PayloadValidationReturn<T> = boolean | {isValid: boolean, details?: T};
export type PayloadValidationCB<T = void> = (payload?: any) => PayloadValidationReturn<T>;


function isValidReturn(val: PayloadValidationReturn<unknown>): boolean {
    return val === true || (typeof val === 'object' && val.isValid === true);
}

function getResultDetails(result: PayloadValidationReturn<unknown>): unknown | undefined {
    return (typeof result === 'object' ? result.details : undefined)
}

export type ValidationItem<T> = {type: 'blocked' | 'pending' | 'noAskForBid' | 'payloadValidation', details: T}
export type CombinedValidationCB<T> = (payload?: any) => {isValid: boolean, passed: ValidationItem<T>[], failed: ValidationItem<T>[]}

export function combinedIsValid(bid?: PlacedBid, bidContext?: PlacedBidContext, payload?: unknown): boolean {
    if(bid === undefined || bidContext === undefined) return false;
    const validations = bidContext.validatedBy?.map(bid => bid.payloadValidationCB) || [];
    return [bid.payloadValidationCB, ...validations].filter(notUndefined).every(validationCB => isValidReturn(validationCB(payload)))
}

export function askForValidationExplainCB(bid?: PlacedBid, bidContext?: PlacedBidContext): CombinedValidationCB<unknown> {
    if(bid === undefined || bidContext === undefined) return (payload?: any) => ({
        isValid: false, passed: [], failed: [{type: 'noAskForBid', details: 'event is not asked for'}]
    });
    return (payload) => {
        const failed: ValidationItem<unknown>[] = [];
        const passed: ValidationItem<unknown>[] = [];
        if (bidContext.blockedBy) {
            failed.push({type: 'blocked', details: `event is blocked by BThreads: ${bidContext.blockedBy?.map(bid => bid.bThreadId).join(', ')}`})
        }
        if (bidContext.pendingBy) {
            failed.push({type: 'pending', details: `event is pending by BThread: ${bidContext.pendingBy}`})
        }
        const validations = bidContext.validatedBy?.map(bid => bid.payloadValidationCB) || [];
        [bid.payloadValidationCB, ...validations].filter(notUndefined).map(validationCB => {
            const result = validationCB(payload);
            if(isValidReturn(result)) {
                passed.push({type: 'payloadValidation', details: getResultDetails(result)})
            } else {
                failed.push({type: 'payloadValidation', details: getResultDetails(result)})
            }
        })
        return {
            isValid: failed.length === 0,
            passed: passed,
            failed: failed
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