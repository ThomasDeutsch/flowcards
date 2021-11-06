import { PlacedBid } from './bid';

export type PayloadValidationResult<V> = boolean | V[];
export type PayloadValidationCB<P, V> = (value: P) => PayloadValidationResult<V>;


export function isValidReturn(result: PayloadValidationResult<any>): boolean {
    return result === true || (typeof result === 'object' && result.length > 0);
}

export type ValidationResults<V> = { isValid: boolean, failed: V[] };

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

export function validateAll<P>(validationCallbacks: PayloadValidationCB<P, unknown>[], value: P): ValidationResults<any> {
    const failed: any[] = [];
    validationCallbacks.forEach(validationCB => {
        const validationResult = validationCB(value);
        if(!isValidReturn(validationResult)) {
            failed.push(validationResult)
        }
    });
    return {
        isValid: failed.length === 0,
        failed: failed
    };
}
