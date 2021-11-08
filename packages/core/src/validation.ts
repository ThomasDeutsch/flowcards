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

export type ValidationResults<V> = { isValid: boolean, failed: V[], passed: V[] };

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

export function validateAll<P, V>(validationCallbacks: PayloadValidationCB<P, V>[], value: P): ValidationResults<V> {
    let booleanFailed = false;
    let failed: V[] = [];
    let passed: V[] = [];
    validationCallbacks.forEach((validationCB) => {
        const validationResult = validationCB(value);
        if(typeof validationResult === 'boolean') {
            booleanFailed = true;
            return;
        }
        if(Array.isArray(validationResult)) {
            failed = failed.concat(validationResult);
            return;
        }
        if(validationResult.failed?.length){
            failed = failed.concat(validationResult.failed);
        }
        if(validationResult.passed?.length) {
            passed = passed.concat(validationResult.passed);
        }
    });
    return {
        isValid: booleanFailed || failed.length === 0,
        failed: failed,
        passed: passed
    };
}
