import { Action, RejectPendingRequestAction } from "./action.ts";
import { Engine } from "./engine.ts";
import { explainValidation } from "./payload-validation.ts";
import { reactToExternalAction, reactToRejectAction, reactToResolveAsyncAction } from "./flow-reaction.ts";
import { invalidReasonForPendingRequestBid } from "./bid-invalid-reasons.ts";
import { Placed, RequestBid } from "./bid.ts";

/**
 * @internal
 * function to process the next valid action.
 *  There are 3 types of actions that are handled by this function:
 *   A: external action: an external action is created by an event.dispatch call
 *   B: resolvePendingRequest: a resolvePendingRequest action is created if a pending event is resolved
 *   C: rejectPendingRequest: a rejectPendingRequest action is created if a pending event is rejected
 * @param info the information about bids and pending actions
 * @returns true if the next action was processed
 */
export function processAction(engine: Engine, nextAction: Action<any>): boolean {
    const currentBids = engine.orderedRequestsAndCurrentBids.currentBidsByEventId.get(nextAction.eventId);
    // check if the event information is available (if any bid is placed for this event id)
    if(currentBids === undefined) {
        engine.__actionReactionLogger.__logInvalidBidReason({eventId: nextAction.eventId, type: 'no current bids for this event'});
        return false;
    }
    const nextActionId = engine.currentActionId + 1;

    // A. external action
    if(nextAction.type === 'external') {
        const event = currentBids.event;
        const {invalidBidReason, accumulatedValidationResults, askForBid} = event.validate(nextAction.payload);
        if(invalidBidReason !== undefined) {
            engine.__actionReactionLogger.__logInvalidBidReason(invalidBidReason);
            return false;
        }
        if(accumulatedValidationResults && accumulatedValidationResults.isValidAccumulated === false) {
            engine.__actionReactionLogger.__logInvalidPayload(accumulatedValidationResults);
            return false;
        }
        const action = {...nextAction, id: nextActionId};
        if(askForBid === undefined) {
            throw new Error('unexpected error: after bid validation, the askFor bid should not be undefined');
        }
        reactToExternalAction(currentBids, action, askForBid);
        engine.__actionReactionLogger.__onActionProcessed(action);
        return true;
    }

    // B. resolvePendingRequest
    if(nextAction.type === 'resolvePendingRequest') {
        const pendingRequestBid = currentBids.pendingRequest;
        const invalidBidReason = invalidReasonForPendingRequestBid(nextAction, pendingRequestBid);
        if(invalidBidReason !== undefined) {
            engine.__actionReactionLogger.__logInvalidBidReason(invalidBidReason);
            return false;
        }
        if(pendingRequestBid === undefined) {
            throw new Error('unexpected error: after bid validation, the pending request bid should not be undefined');
        }
        const validationResult = explainValidation(currentBids, nextAction.payload, [pendingRequestBid, pendingRequestBid.isTriggerAskedFor ? currentBids.askFor![0] : undefined]);
        if(validationResult.isValidAccumulated === false) {
            // if the validation result is not valid, create a rejectPendingRequest action
            const rejectAction: RejectPendingRequestAction & {id: number} = {
                id: nextActionId,
                type: 'rejectPendingRequest',
                eventId: nextAction.eventId,
                flowPath: nextAction.flowPath,
                bidId: nextAction.bidId,
                requestActionId: nextAction.requestActionId,
                error: validationResult
            };
            reactToRejectAction(pendingRequestBid.flow, currentBids.event);
            engine.__actionReactionLogger.__onActionProcessed(rejectAction);
            return true;
        }
        reactToResolveAsyncAction(currentBids, {...nextAction, id: nextActionId}, pendingRequestBid);
        engine.__actionReactionLogger.__onActionProcessed({...nextAction, id: nextActionId});
        return true;
    }

    // C. rejectPendingRequest
    if(nextAction.type === 'rejectPendingRequest') {
        let pendingRequestBid = currentBids.pendingRequest;
        const invalidReason = invalidReasonForPendingRequestBid(nextAction, pendingRequestBid);
        if(invalidReason !== undefined) {
            engine.__actionReactionLogger.__logInvalidBidReason(invalidReason);
            return false;
        }
        pendingRequestBid = pendingRequestBid as Placed<RequestBid<any, any>>; // is not undefined because of the invalidReasonsForPendingRequestBid check
        reactToRejectAction(pendingRequestBid.flow, currentBids.event);
        engine.__actionReactionLogger.__onActionProcessed({...nextAction, id: nextActionId});
        return true;
    }
    throw new Error('unexpected error: processAction was called with an invalid action type');
}