import { PlacedBid } from './bid';
import { AllPlacedBids, AnyAction, getHighestPrioAskForBid, PlacedBidContext } from '.';
import { notUndefined } from './utils';

export enum UIActionCheck {
    OK = 'OK',
    EventIsBlocked = 'EventIsBlocked',
    EventIsPending = 'EventIsPending',
    HasInvalidPayload = 'HasInvalidPayload',
    NoPlacedBidForNameKeyId = 'NoPlacedBidForNameKeyId',
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

export type PayloadValidationReturn = boolean | {isValid: boolean, reason?: string};
export type PayloadValidationCB<P> = (payload?: P) => PayloadValidationReturn;

function isValidReturn(val: PayloadValidationReturn): boolean {
    return val === true || (typeof val === 'object' && val.isValid === true);
}

function getResultDetails(result: PayloadValidationReturn): string | undefined {
    return (typeof result === 'object' ? result.reason : undefined)
}

export type CombinedValidationItem = { type: 'blocked' | 'betweenBids' | 'pending' | 'noAskForBid' | 'payloadValidation' | 'eventPayloadValidation', reason?: string }
export type CombinedValidation = {isValid: boolean, passed: CombinedValidationItem[], failed: CombinedValidationItem[]}
export type CombinedValidationCB<P> = (payload?: P) => CombinedValidation;


export function combinedIsValid(bid?: PlacedBid, bidContext?: PlacedBidContext, payload?: unknown): boolean {
    if(bid === undefined || bidContext === undefined) return false;
    const validations = bidContext.validatedBy?.map(bid => bid.payloadValidationCB) || [];
    return [bid.payloadValidationCB, ...validations].filter(notUndefined).every(validationCB => isValidReturn(validationCB(payload)))
}

export function askForValidationExplainCB<P>(areBThreadsProgressing: () => boolean, bid?: PlacedBid, bidContext?: PlacedBidContext): CombinedValidationCB<P> {
    if(bid === undefined || bidContext === undefined) return (payload?: P) => ({
        isValid: false, passed: [], failed: [{type: 'noAskForBid', reason: 'event is not asked for'}]
    });
    return (payload) => {
        const failed: CombinedValidationItem[] = [];
        const passed: CombinedValidationItem[] = [];
        if(areBThreadsProgressing()) {
            return {
                isValid: false,
                passed: [],
                failed: [{type: 'betweenBids', reason: `BThreads are progressing and bids are recalculating`}]
            }
        }
        if(bidContext.blockedBy) {
            failed.push({type: 'blocked', reason: `event is blocked by BThreads: ${bidContext.blockedBy?.map(bid => bid.bThreadId.name).join(', ')}`})
        }
        if(bidContext.pendingBy) {
            failed.push({type: 'pending', reason: `event is pending by BThread: ${bidContext.pendingBy.name}${bidContext.pendingBy.key ? '-' + bidContext.pendingBy.key: ''}`})
        }
        const validations = bidContext.validatedBy?.map(bid => bid.payloadValidationCB) || [];
        [bid.payloadValidationCB, ...validations].filter(notUndefined).map(validationCB => {
            const result = validationCB(payload);
            if(isValidReturn(result)) {
                passed.push({type: 'payloadValidation', reason: getResultDetails(result)})
            } else {
                failed.push({type: 'payloadValidation', reason: getResultDetails(result)})
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
    if((action.type === "requestedAction" && action.bidType !== 'triggerBid') ||
      (action.type !== "uiAction")) return UIActionCheck.OK;
    const bidContext = allPlacedBids.get(action.eventId);
    if(bidContext === undefined) return UIActionCheck.NoPlacedBidForNameKeyId;
    if(bidContext.blockedBy) return UIActionCheck.EventIsBlocked;
    if(bidContext.pendingBy) return UIActionCheck.EventIsPending;
    // re-check the dispatched action, because this action comes from a buffer, it could be that the user was able
    // to dispatch, but another action may caused BThread changes.
    const askForBid = getHighestPrioAskForBid(allPlacedBids, action.eventId, action);
    if(askForBid === undefined) return UIActionCheck.NoMatchingAskForBid;
    return UIActionCheck.OK
}
