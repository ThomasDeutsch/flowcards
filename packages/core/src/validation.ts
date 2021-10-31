import { PlacedBid } from './bid';
import { Bid, PlacedBidContext } from '.';

export type PayloadValidationReturn = boolean | { passed: any[], failed: any[] };
export type PayloadValidationCB<P> = (value: P) => PayloadValidationReturn;

function isValidReturn(val: PayloadValidationReturn): boolean {
    return val === true || (typeof val === 'object' && !!val.failed?.length);
}

function getResultDetails(result: PayloadValidationReturn): any[] | undefined {
    return (typeof result === 'object' ? (result.passed || result.failed) : undefined)
}

export type ValidationResult = { type: 'blocked' | 'pending' | 'noAskForBid' | 'payloadValidation' | 'eventNotEnabled' | 'notAllowedDuringStaging' | 'eventDisabledDuringDispatch', reason?: any }
export type ValidationResults = { passed: ValidationResult[], failed: ValidationResult[] };
export type CombinedValidationCB<P> = (value: P) => ValidationResults;

function getAllPayloadValidations<P>(bid: PlacedBid<P>, bidContext: PlacedBidContext): PayloadValidationCB<P>[] {
    const validations = [];
    if(bid.payloadValidationCB !== undefined) {
        validations.push(bid.payloadValidationCB);
    }
    bidContext.validatedBy?.forEach(bid => {
        if(bid.payloadValidationCB !== undefined) {
            validations.push(bid.payloadValidationCB);
        }
    });
    return validations;
}

export function isValidPayload<P>(bid: PlacedBid<P>, bidContext: PlacedBidContext, value: P): boolean {
    const validations = getAllPayloadValidations(bid, bidContext);
    return validations.every(validationCB => isValidReturn(validationCB(value)));
}

export const explainEventNotEnabled: CombinedValidationCB<any> = <P>(value: P) => ({ passed: [], failed: [{type: 'eventNotEnabled'}]});
export const explainDispatchPending: CombinedValidationCB<any> = <P>(value: P) => ({ passed: [], failed: [{type: 'eventDisabledDuringDispatch'}]});

export function askForValidationExplainCB<P>(bid?: PlacedBid<P>, bidContext?: PlacedBidContext): CombinedValidationCB<P> {
    return (value: P) => {
        const failed: ValidationResult[] = [];
        const passed: ValidationResult[] = [];
        if(bid === undefined || bidContext === undefined) {
            return {
                passed: [],
                failed: [{type: 'noAskForBid', reason: 'event is not asked for'}]}
        }
        if(bidContext.blockedBy) {
            failed.push({type: 'blocked', reason: `event is blocked by BThreads: ${bidContext.blockedBy.join(', ')}`})
        }
        if(bidContext.pendingBy) {
            failed.push({type: 'pending', reason: `event is pending by BThread: ${bidContext.pendingBy.name}${bidContext.pendingBy.key ? '-' + bidContext.pendingBy.key: ''}`})
        }
        if(bidContext.isDisabled) {
            failed.push({type: 'eventNotEnabled', reason: `event was not enabled in the staging-function.`})
        }
        getAllPayloadValidations(bid, bidContext).forEach(validationCB => {
            const validationResult = validationCB(value);
            if(isValidReturn(validationResult)) {
                passed.push({type: 'payloadValidation', reason: getResultDetails(validationResult)})
            } else {
                failed.push({type: 'payloadValidation', reason: getResultDetails(validationResult)})
            }
        });
        return {
            passed: passed,
            failed: failed
        };
    }
}
