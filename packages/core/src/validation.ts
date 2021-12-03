import { BEvent } from '.';
import { PlacedBid } from './bid';
import { notEmpty } from './utils';

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


type ValidationResultsType = 'eventNotConnected' | 'noAskForBid' | 'eventIsBlocked' | 'eventIsPending' | 'payloadValidation';


export type ValidationResults<P, V> = {
    type: ValidationResultsType,
    isValid: boolean,
    failed: V[],
    passed: V[],
    selectedBids?: PlacedBid<P>[]
};


export function getAllPayloadValidationCallbacks<P, V>(bids: PlacedBid[]): PayloadValidationCB<P, V>[] {
    return bids.map(bid => bid.payloadValidationCB).filter(notEmpty);
}


export function isValidPayload<P>(validationCallbacks: PayloadValidationCB<P, any>[], value: P): boolean {
    if(validationCallbacks.length === 0) return true;
    return validationCallbacks.every(cb => isValidReturn(cb(value)));
}


export function validateDispatch<P, V>(value: P, event?: BEvent<P, V>): ValidationResults<P, V> {
    const response = {isValid: false, passed: [], failed: [], selectedBid: undefined };
    if(event?.isConnected !== true) return {...response, type: 'eventNotConnected'};
    const askForBids = event.getBids('askForBid');
    if(askForBids === undefined) return {...response, type: 'noAskForBid'};
    const validationCallbacks = getAllPayloadValidationCallbacks<P, V>([...askForBids, ...(event.getBids('validateBid') || [])]);
    if(event.getBids('blockBid') !== undefined) {
        return {...response, type: 'eventIsBlocked', selectedBids: askForBids};
    }
    if(event.isPending) {
        return {...response, type: 'eventIsPending', selectedBids: askForBids};
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
    return {type: 'payloadValidation', isValid, failed, passed, selectedBids: askForBids};
}
