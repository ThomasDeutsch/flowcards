import { ExternalAction } from "./action";
import { EventInformation, isSameBid, PlacedBid, PlacedRequestBid, PlacedTriggerBid, PlacedWaitingBid } from "./bid";
import { Event } from "./event";
import { isSameTupleId, toTupleIdString, TupleId } from "./tuple-map";
import { isDefined } from "./utils";


// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

/**
 * a validation needs to return a boolean or a record with a isValid flag
 * this interface needs to be implemented by any validation-extension ( like zod )
 */
export type BaseValidationReturn<V> = {isValid: boolean, details?: V[]} | boolean | void;

/**
 * the reason why an action can not be used
 */
export interface InvalidActionExplanation {
    eventId: TupleId;
    message: string;
}

/**
 * explanation result that is collected during the action selection process
 * isValid only exists for performance reasons - it is the accumulated value of all validations.
 */
 export interface AccumulatedValidationResults<V> {
    isValidAccumulated: boolean,
    results: {isValid: boolean, details: V[]}[];
}


// CORE FUNCTIONS -----------------------------------------------------------------------------------------------------

/**
 * @internal
 * function that returns an explanation if no bid information was placed by all flows
 * @param eventInfo all information about the event and all placed bids
 * @returns an explanation or undefined if event information exists.
 */
export function explainAnyBidPlacedByFlow<P, V>(eventId: TupleId, eventInfo?: EventInformation<P, V>): InvalidActionExplanation | undefined {
    if(eventInfo === undefined) {
        return { eventId, message: 'no bid placed for this event'}
    }
    return undefined;
}

/**
 * @internal
 * function that returns an explanation if an exact bid has been placed by a flow.
 * this function is used by the replay, to check the exact bid has been placed by a flow.
 * @param eventInfo all information about the event and all placed bids
 * @returns an explanation or undefined if bid exists
 */
 export function explainExactRequestBidPlacedByFlow<P, V>(requestedBid: PlacedRequestBid<P, V> | PlacedTriggerBid<P, V> | undefined, bid: {event: Event<P,V>, type: 'request' | 'trigger', flowId: TupleId, id: number}): InvalidActionExplanation | undefined {
    if(requestedBid === undefined) {
        return { eventId: bid.event.id, message: `no ${bid.type} bid was placed for this event` }
    }
    if(!isSameTupleId(requestedBid.flow.id, bid.flowId) || requestedBid.id !== bid.id) {
        return { eventId: bid.event.id, message: `the expected ${bid.type} bid is not the highest priority bid placed by the flows` }
    }
    return undefined;
}

/**
 * @internal
 * function that returns an explanation if a resolve can be performed
 * @param eventInfo all information about the event and all placed bids
 * @param actionInfo the flow&bid of the resolve/reject action
 * @returns an explanation if the bid can resolve/reject a pending request
 */
 export function explainNoPendingRequest<P, V>(eventInfo: EventInformation<P, V>, actionInfo: {flowId: TupleId, bidId: number} ): InvalidActionExplanation | undefined {
    // resolve a pending request
    if(eventInfo.pendingRequest && isSameTupleId(eventInfo.pendingRequest.flow.id, actionInfo.flowId) && eventInfo.pendingRequest.id === actionInfo.bidId) {
        return undefined
    }
    return { eventId: eventInfo.event.id, message: 'no pending request found for this action' }
}

/**
 * @internal
 * a function that returns an explanation if an event is blocked and what flow is responsible for the blockage
 * @param allPlacedBids all placed bids
 * @param event event to explain
 * @returns an explanation of what flows are blocking the event
 */
 export function explainBlocked<P, V>(eventInfo: EventInformation<P, V>): InvalidActionExplanation | undefined {
    if(eventInfo.block.length === 0) {
        return undefined;
    }
    let message = '';
    const isBlocked = eventInfo.block.some(block => {
        if(block.validate == undefined || (block.validate && isValidReturn(block.validate()))) {
            message = `event is blocked by flow ${toTupleIdString(block.flow.id)}`;
            return true;
        }
        return false;
    });
    if(!isBlocked) return undefined;
    return { eventId: eventInfo.event.id, message };
}

/**
 * @internal
 * a function that returns an explanation if an event is a pending async request and what flow is pending the request
 * @param flowId if a request is pending, but it is pending from the same flow, it is not logged as an invalid request
 * @param event event to explain
 * @returns an explanation of what flows are blocking the event
 */
export function explainPendingRequest<P, V>(eventInfo: EventInformation<P, V>, flowId?: TupleId): InvalidActionExplanation | undefined {
    if(eventInfo.pendingRequest === undefined || (flowId && isSameTupleId(eventInfo.pendingRequest.flow.id, flowId))) {
        return undefined;
    }
    return { eventId: eventInfo.event.id, message: `event has a pending request from flow ${toTupleIdString(eventInfo.pendingRequest.flow.id)}` };
}

/**
 * @internal
 * a function that returns an explanation if an event is a pending extend and what flow hosting the extend
 * @param eventInfo all information about the event and all placed bids
 * @param resolveExtendBid the bid that is used to resolve the extend (askFor (external), request, trigger, resolveAsync)
 * @returns an explanation of what flows are blocking the event
 */
 export function explainPendingExtend<P, V>(eventInfo: EventInformation<P, V>, resolveExtendBid?: PlacedBid<P,V>): InvalidActionExplanation | undefined {
    if(eventInfo.pendingExtend === undefined) {
        return undefined;
    }
    const isResolveExtendBid = Boolean(resolveExtendBid && isSameTupleId(resolveExtendBid.flow.id, eventInfo.pendingExtend.extendingFlow.id));
    if(isResolveExtendBid) return undefined;
    return { eventId: eventInfo.event.id, message: `event has a pending extend. Flow ${toTupleIdString(eventInfo.pendingExtend.extendingFlow.id)} is extending the event.` };
}

/**
 * @internal
 * function that returns an explanation if the highest priority askFor bid is valid.
 * @param eventInfo all information about the event and all placed bids
 * @param externalAction the external action that was created by a event.dispatch
 * @returns an explanation of the highest priority askFor bid
 */
 export function explainHighestPriorityAskFor<P, V>(eventInfo: EventInformation<P, V>, externalAction?: ExternalAction<P> ): InvalidActionExplanation | undefined {
    const highestPriorityAskForBid = eventInfo.askFor[0];
    if(highestPriorityAskForBid === undefined) {
        return { eventId: eventInfo.event.id, message: 'no askFor bid was placed for this event' }
    }
    if(externalAction && !isSameBid(highestPriorityAskForBid, externalAction.flowId, externalAction.bidId)) {
        return { eventId: eventInfo.event.id, message: 'the external action is not based on the highest priority askFor bid' }
    }
}

/**
 * @internal
 * a function that return an explanation of the validation bids of an event
 * @param eventInfo event information (see EventInformation)
 * @param value the value to validate
 * @param additionalBids additional bids to validate
 * @returns an explanation of the validation bids (valid and invalid)
 */
export function explainValidation<P, V>(eventInfo: EventInformation<P, V>, value: P, additionalBids: (PlacedBid<P, V> | undefined)[] = []): AccumulatedValidationResults<V> | undefined {
    let isValidAccumulated = true;
    let results: {isValid: boolean, details: V[]}[] = [];
    const maybeExtendBid = eventInfo.pendingExtend?.extendedBid;
    [maybeExtendBid, ...additionalBids, ...eventInfo.validate].filter(isDefined).forEach(bid => {
        const validationResult = validateBid(bid, value);
        if(validationResult) {
            if(typeof validationResult === 'boolean') {
                isValidAccumulated = isValidAccumulated && validationResult;
            } else {
                if(validationResult.details) {
                    results = [...results, {isValid: validationResult.isValid, details: validationResult.details || []}];
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
 export function validateBid<P, V>(bid: PlacedBid<P, V>, value: P): BaseValidationReturn<V> | undefined {
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