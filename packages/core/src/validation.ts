import { EventBidInfo, getHighestPriorityAskForBid } from '.';
import { PlacedBid } from './bid';

export type PayloadValidationResult<V> = boolean | V[] | { failed?: V[], passed?: V[] };
export type PayloadValidationCB<P, V> = (value: P) => PayloadValidationResult<V>;


export function isValidReturn(result: PayloadValidationResult<any>): boolean {
    if(typeof result === 'boolean') {
        return result;
    }
    if(Array.isArray(result)) {
        return result.length === 0;
    }
    return !result.failed?.length;
}


type ValidationResultsType = 'eventNotConnected' | 'noBidsForEvent' | 'noAskForBid' | 'eventIsBlocked' | 'eventIsPending' | 'payloadValidation';


export type ValidationResults<P, V> = {
    type: ValidationResultsType,
    isValid: boolean,
    failed: V[],
    passed: V[],
    bidInfo?: EventBidInfo,
    selectedBid?: PlacedBid<P>
};


export function getAllPayloadValidationCallbacks<P, V>(bid: PlacedBid<P>, validateBids?: PlacedBid[]): PayloadValidationCB<P, V>[] {
    const validationCallbacks = [];
    if(bid.payloadValidationCB !== undefined) {
        validationCallbacks.push(bid.payloadValidationCB);
    }
    validateBids?.forEach(bid => {
        if(bid.payloadValidationCB !== undefined) {
            validationCallbacks.push(bid.payloadValidationCB);
        }
    });
    return validationCallbacks;
}


export function isValidPayload<P>(validationCallbacks: PayloadValidationCB<P, any>[], value: P): boolean {
    return validationCallbacks.every(cb => isValidReturn(cb(value)));
}


export function validateDispatch<P, V>(isEventConnected: boolean, value: P, bidInfo?: EventBidInfo): ValidationResults<P, V> {
    const response = {isValid: false, passed: [], failed: [], bidInfo: bidInfo, selectedBid: undefined };
    if(!isEventConnected) return {...response, type: 'eventNotConnected'};
    if(bidInfo === undefined) return {...response, type: 'noBidsForEvent'};
    const askForBid = getHighestPriorityAskForBid<P>(bidInfo.waitingBids);
    if(askForBid === undefined) return {...response, type: 'noAskForBid'};
    const validationCallbacks = getAllPayloadValidationCallbacks<P, V>(askForBid, bidInfo.validateBids);
    if(bidInfo.blockedBy) {
        return {...response, type: 'eventIsBlocked', selectedBid: askForBid};
    }
    if(bidInfo.pendingBy) {
        return {...response, type: 'eventIsPending', selectedBid: askForBid};
    }
    let isValid = true;
    let failed: V[] = [];
    let passed: V[] = [];
    validationCallbacks.forEach((validationCB) => {
        const validationResult = validationCB(value);
        if(validationResult === true) {
            return;
        }
        if(validationResult === false) {
            isValid = false;
            return;
        }
        if(Array.isArray(validationResult)) {
            failed = failed.concat(validationResult);
            isValid = false;
            return;
        }
        if(validationResult.failed?.length){
            failed = failed.concat(validationResult.failed);
            isValid = false;
        }
        if(validationResult.passed?.length) {
            passed = passed.concat(validationResult.passed);
        }
    });
    return {type: 'payloadValidation', isValid, failed, passed, bidInfo, selectedBid: askForBid};
}
