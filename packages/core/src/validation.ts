import { PlacedBid } from './bid';
import { PlacedBidContext } from '.';

export type PayloadValidationReturn = boolean | {isValid: boolean, reason?: string};
export type PayloadValidationCB<P> = (payload?: P) => PayloadValidationReturn;

function isValidReturn(val: PayloadValidationReturn): boolean {
    return val === true || (typeof val === 'object' && val.isValid === true);
}

function getResultDetails(result: PayloadValidationReturn): string | undefined {
    return (typeof result === 'object' ? result.reason : undefined)
}

export type CombinedValidationItem = { type: 'blocked' | 'pending' | 'noAskForBid' | 'payloadValidation' | 'eventNotEnabled' | 'notAllowedDuringStaging', reason?: string }
export type CombinedValidation = {isValid: boolean, passed: CombinedValidationItem[], failed: CombinedValidationItem[]}
export type CombinedValidationCB<P> = (payload?: P) => CombinedValidation;

function getAllPayloadValidations(bid: PlacedBid, bidContext: PlacedBidContext): PayloadValidationCB<any>[] {
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

export function isValidPayload(bid: PlacedBid, bidContext: PlacedBidContext, payload?: unknown): boolean {
    const validations = getAllPayloadValidations(bid, bidContext);
    return validations.every(validationCB => isValidReturn(validationCB(payload)))
}

//TODO: remove this - use askForValidationExplainCB
export const explainEventNotEnabled: CombinedValidationCB<any> = (payload: any) => ({ isValid: false, passed: [], failed: [{type: 'eventNotEnabled', reason: 'event is not enabled'}]});

//TODO: remove this - use askForValidationExplainCB
export const explainNotAllowedDuringStaging: CombinedValidationCB<any> = (payload: any) => ({ isValid: false, passed: [], failed: [{type: 'notAllowedDuringStaging', reason: 'event can not be dispatched during staging'}]});

export function askForValidationExplainCB<P>(bid?: PlacedBid, bidContext?: PlacedBidContext): CombinedValidationCB<P> {
    return (payload) => {
        const failed: CombinedValidationItem[] = [];
        const passed: CombinedValidationItem[] = [];
        if(bid === undefined || bidContext === undefined) {
            return {isValid: false,
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
            const validationResult = validationCB(payload);
            if(isValidReturn(validationResult)) {
                passed.push({type: 'payloadValidation', reason: getResultDetails(validationResult)})
            } else {
                failed.push({type: 'payloadValidation', reason: getResultDetails(validationResult)})
            }
        });
        return {
            isValid: failed.length === 0,
            passed: passed,
            failed: failed
        };
    }
}
