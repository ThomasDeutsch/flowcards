import { AnyBid, CurrentBidsForEvent, Placed } from "./bid.ts";
import { isDefined } from "./utils.ts";


// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

export type BaseValidationReturn<V> = {isValid: boolean, details?: V[]} | boolean | void;

 export interface AccumulatedValidationResults<V> {
    isValidAccumulated: boolean,
    results?: {isValid: boolean, details: V[], ruleId: string, bidId: number}[];
}


export function explainValidation<P, V>(currentBids: CurrentBidsForEvent<P, V>, value: P, additionalBids: (Placed<AnyBid<P,V>> | undefined)[] = []): AccumulatedValidationResults<V> {
    let isValidAccumulated = true;
    let results: {isValid: boolean, details: V[], ruleId: string, bidId: number}[] = [];
    const latestExtendBid = currentBids.pendingExtend?.extendedBids[0];
    const bids = [latestExtendBid, ...additionalBids].filter(isDefined);
    bids.forEach(bid => {
        const validationResult = validateBid(bid, value);
        if(validationResult) {
            if(typeof validationResult === 'boolean') {
                isValidAccumulated = isValidAccumulated && validationResult;
            } else {
                if(validationResult.details) {
                    results = [...results, {isValid: validationResult.isValid, bidId: bid.id, ruleId: bid.rule.id, details: validationResult.details || []}];
                }
                isValidAccumulated = isValidAccumulated && validationResult.isValid;
            }
        }
    });
    return { isValidAccumulated, results };
}

 export function validateBid<P, V,>(bid: Placed<AnyBid<P,V>>, value: P): BaseValidationReturn<V> | undefined {
    const validation = bid.validate?.(value);
    if(validation === undefined) return undefined;
    if(typeof validation === 'boolean') return { isValid: validation };
    return validation;
}

export function isValidReturn(validation: BaseValidationReturn<any>): boolean {
    if(validation === undefined) return true;
    if(typeof validation === 'boolean') return validation;
    return validation.isValid;
}