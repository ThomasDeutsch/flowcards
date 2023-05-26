import { AnyBid, CurrentBidsForEvent, Placed } from "./bid.ts";
import { isDefined } from "./utils.ts";


// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

/**
 * a validation needs to return a boolean or a record with a isValid flag
 * this interface needs to be implemented by any validation-extension ( like zod )
 */
export type BaseValidationReturn<V> = {isValid: boolean, details?: V[]} | boolean | void;

/**
 * explanation result that is collected during the action selection process.
 * isValid only exists for performance reasons - it is the accumulated value of all validations.
 */
 export interface AccumulatedValidationResults<V> {
    isValidAccumulated: boolean,
    results?: {isValid: boolean, details: V[], flowId: string, bidId: number}[];
}

/**
 * @internal
 * a function that return an explanation of the validation bids of an event
 * @param eventInfo event information (see )
 * @param value the value to validate
 * @param additionalBids additional bids to validate
 * @returns an explanation of the validation bids (valid and invalid)
 */
export function explainValidation<P, V>(currentBids: CurrentBidsForEvent<P, V>, value: P, additionalBids: (Placed<AnyBid<P,V>> | undefined)[] = []): AccumulatedValidationResults<V> {
    let isValidAccumulated = true;
    let results: {isValid: boolean, details: V[], flowId: string, bidId: number}[] = [];
    const latestExtendBid = currentBids.pendingExtend?.extendedBids[0];
    const bids = [latestExtendBid, ...additionalBids, ...(currentBids.validate || [])].filter(isDefined);
    bids.forEach(bid => {
        const validationResult = validateBid(bid, value);
        if(validationResult) {
            if(typeof validationResult === 'boolean') {
                isValidAccumulated = isValidAccumulated && validationResult;
            } else {
                if(validationResult.details) {
                    results = [...results, {isValid: validationResult.isValid, bidId: bid.id, flowId: bid.flow.id, details: validationResult.details || []}];
                }
                isValidAccumulated = isValidAccumulated && validationResult.isValid;
            }
        }
    });
    return { isValidAccumulated, results };
}


// HELPERS ------------------------------------------------------------------------------------------------------------


/**
 * @internal
 * a function that validates a single bid
 * @param bid the placed bid to validate
 * @param value the value to validate
 * @returns an validation result
 */
 export function validateBid<P, V,>(bid: Placed<AnyBid<P,V>>, value: P): BaseValidationReturn<V> | undefined {
    const validation = bid.validate?.(value);
    if(validation === undefined) return undefined;
    if(typeof validation === 'boolean') return { isValid: validation };
    return validation;
}

/**
 * @internal
 * function that returns true if a validation is valid
 * @param validation a value of type BaseValidationReturn
 * @returns true if the validation is valid
*/
export function isValidReturn(validation: BaseValidationReturn<any>): boolean {
    if(validation === undefined) return true;
    if(typeof validation === 'boolean') return validation;
    return validation.isValid;
}

/**
 * @internal
 * function that returns true if the validation results are valid
 * @param validationResults accumulated validation results
 * @returns true if the validation is valid
 */
export function isValid(validationResults: AccumulatedValidationResults<any>): boolean {
    return validationResults.isValidAccumulated;
}
