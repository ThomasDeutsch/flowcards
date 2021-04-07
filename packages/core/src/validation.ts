import { PlacedBid, BidType } from './bid';
import { EventId } from './event-map';
import { getProgressingBids } from './advance-bthreads';
import { ActionType, AllPlacedBids, AnyAction, getHighestPrioAskForBid } from '.';


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

export function validateDispatchedUIAction(action: AnyAction, allPlacedBids: AllPlacedBids): UIActionCheck {
    if(action.type !== ActionType.ui) return UIActionCheck.OK;
    const eventContext = allPlacedBids.get(action.eventId);
    if(eventContext === undefined) return UIActionCheck.NoPlacedBidForEventId;
    if(eventContext.blockedBy) return UIActionCheck.EventIsBlocked;
    if(eventContext.pendingBy) return UIActionCheck.EventIsPending;
    // re-check the dispatched action, because this action comes from a buffer, it could be that the user was able
    // to dispatch, but another action may caused BThread changes.
    const askForBid = getHighestPrioAskForBid(allPlacedBids, action.eventId);
    if(askForBid === undefined) return UIActionCheck.NoMatchingAskForBid;
    //TODO: askForBid?.validate(action.payload);
    return UIActionCheck.OK
}

    // 1. get bids
    // get all askFor bids for this eventId.
    // get all validate and block bids for this eventId.
    // 2. Combine validators
    // for every askfor, combine validation with the validate and block bids.

    // const validationBids = activeBidsByType[BidType.validate]!.get(eventId)!;
    // let errors = validationBids.map(bid => bid.validate?(payload) || null)
    // const blockBids = activeBidsByType[BidType.block]!.get(eventId)!;
    // errors.concat(blockBids.map(bid => bid.explain|| null));
    // const askForBids = activeBidsByType[BidType.askFor]!.get(eventId)!; // ensured by event-context 
    // const basicErrors = askForBids.map(bid => bid.validate?(payload) || null);
    // return basicErrors.map(error => error.concat(errors));






export type Validation = (payload: any) => {isValid: boolean; message?: string} | boolean


// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isValid(bid: PlacedBid, payload?: any): boolean {
    if(!bid.validate) return true;
    const validationReturn = bid.validate(payload);
    if(validationReturn === true) return true;
    if(validationReturn === false) return false;
    if(validationReturn.isValid === true) return true;
    return false;
}


export type BidValidationResult = {isValid: boolean; bid: PlacedBid; message?: string}


export function getValidationResult(bid: PlacedBid, payload?: unknown): BidValidationResult {
    if(bid.validate === undefined) return {isValid: true, bid: bid, message: bid.eventId.description};
    const validationReturn = bid.validate(payload);
    if(validationReturn === true) return {isValid: true, bid: bid, message: bid.eventId.description};
    if(validationReturn === false) return {isValid: false, bid: bid, message: bid.eventId.description};
    if(validationReturn.isValid === true) return {isValid: true, bid: bid, message: validationReturn.message};
    return {isValid: false, bid: bid, message: validationReturn.message};
}


export function withValidPayload(bids: PlacedBid[] | undefined, payload: unknown): boolean {
    return (bids !== undefined) && bids.some(bid => isValid(bid, payload))
}


export interface ValidationResult {
    isValid: boolean;
    required: BidValidationResult[][];
    optional: BidValidationResult[];
    progressingBids: PlacedBid[];
}


// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function validate(activeBidsByType: AllPlacedBids, eventId: EventId, payload: any): ValidationResult {
    return  {
        isValid: true,
        required: [[]],
        optional: [],
        progressingBids: getProgressingBids(activeBidsByType, [BidType.waitFor, BidType.askFor], eventId, payload) || []
    }
    // const askingForBids = activeBidsByType[BidType.askFor]?.get(eventId);
    // const validationResult: ValidationResult = {
    //     isValid: false,
    //     required: [[]],
    //     optional: [],
    //     progressingBids: getProgressingBids(activeBidsByType, [BidType.waitFor, BidType.askFor], eventId, payload) || []
    // }
    // if(askingForBids === undefined) return validationResult;
    // askingForBids.forEach(bid => {
    //     const bidValidationResult = getValidationResult(bid, payload);
    //     validationResult.required[0].push(bidValidationResult);
    // });
    // const waitingForBids = getMatchingBids(activeBidsByType, [BidType.waitFor], eventId);
    // waitingForBids?.forEach(bid => {
    //     const bidValidationResult = getValidationResult(bid, payload);
    //     validationResult.optional.push(bidValidationResult);
    // });
    // const blocks = getMatchingBids(activeBidsByType, [BidType.block], eventId);
    // blocks?.forEach(bid => {
    //     const bidValidationResult = getValidationResult(bid, payload);
    //     bidValidationResult.isValid = !bidValidationResult.isValid; // reverse isValid because a passed block is a restriction.
    //     validationResult.required.push([bidValidationResult]);
    // });
    // const guardedBlocks = getMatchingBids(activeBidsByType, [BidType.guardedBlock], eventId);
    // guardedBlocks?.forEach(bid => {
    //     const bidValidationResult = getValidationResult(bid, payload);
    //     bidValidationResult.isValid = !bidValidationResult.isValid; // reverse isValid because a passed block is a restriction.
    //     validationResult.required.push([bidValidationResult]);
    // });
    // validationResult.isValid = validationResult.required.every(r => r.some(({isValid}) => isValid === true));
    // return validationResult;
}
