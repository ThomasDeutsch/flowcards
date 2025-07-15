import { Action, RejectPendingRequestAction } from "./action.ts";
import { Engine } from "./engine.ts";
import { explainValidation } from "./payload-validation.ts";
import { reactToInputAction, reactToRejectAction, reactToResolveAsyncAction } from "./rule-reactions.ts";
import { invalidReasonForPendingRequestBid } from "./bid-invalid-reasons.ts";
import { Placed, SetBid } from "./bid.ts";


export function processAction(engine: Engine, nextAction: Action<any>) {
    const currentBids = engine.orderedRequestsAndCurrentBids.currentBidsByEventId.get(nextAction.eventId);
    if(currentBids === undefined) {
        engine.__actionReactionLogger.__logInvalidBidReason({eventId: nextAction.eventId, type: 'no current bids for this event'});
        return false;
    }
    if(currentBids.event.id !== nextAction.eventId) {
        engine.__actionReactionLogger.__logInvalidBidReason({eventId: nextAction.eventId, type: 'event id does not match the current event'});
        return false;
    }
    const nextActionId = engine.currentActionId + 1;
    if(nextAction.type === 'input') {
        const event = currentBids.event;
        const {invalidBidReason, accumulatedValidationResults, whenBid} = event.validate(nextAction.payload);
        if(invalidBidReason !== undefined) {
            engine.__actionReactionLogger.__logInvalidBidReason(invalidBidReason);
            // Maybe log reaction here too? 
            // engine.__actionReactionLogger.__logRuleReaction(whenBid?.rule.path || [], 'bid validation failed', { eventId: event.id, bidType: 'when', bidId: whenBid?.id, value: nextAction.payload, reason: invalidBidReason.type });
            return false;
        }
        if(whenBid === undefined) { // Check whenBid existence *before* using it for logging
             // If no valid when bid, it's an invalid reason
             engine.__actionReactionLogger.__logInvalidBidReason({ eventId: event.id, type: 'no valid when bid found for input action' });
             return false; 
        }
        if(accumulatedValidationResults && accumulatedValidationResults.isValidAccumulated === false) {
            // Log specific reaction for validation failure
            engine.__actionReactionLogger.__logRuleReaction(whenBid.rule.path, 'bid validation failed', { eventId: event.id, bidType: 'when', bidId: whenBid.id, value: nextAction.payload });
            engine.__actionReactionLogger.__logInvalidPayload(accumulatedValidationResults); // Keep logging detailed payload info
            return false;
        }
        // If whenBid exists and validation passed:
        const action = {...nextAction, id: nextActionId};
        reactToInputAction(currentBids, action, whenBid);
        engine.__actionReactionLogger.__onActionProcessed(action);
        return true;
    }
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
        const validationResult = explainValidation(currentBids, nextAction.payload, [pendingRequestBid, pendingRequestBid.isTrigger ? currentBids.when![0] : undefined]);
        if(validationResult.isValidAccumulated === false) {
            // if the validation result is not valid, create a rejectPendingRequest action
            const rejectAction: RejectPendingRequestAction & {id: number} = {
                id: nextActionId,
                type: 'rejectPendingRequest',
                eventId: nextAction.eventId,
                rulePath: nextAction.rulePath,
                bidId: nextAction.bidId,
                requestActionId: nextAction.requestActionId,
                error: validationResult
            };
            reactToRejectAction(pendingRequestBid.rule, currentBids.event);
            engine.__actionReactionLogger.__onActionProcessed(rejectAction);
            return true;
        }
        reactToResolveAsyncAction(currentBids, {...nextAction, id: nextActionId}, pendingRequestBid);
        engine.__actionReactionLogger.__onActionProcessed({...nextAction, id: nextActionId});
        return true;
    }
    if(nextAction.type === 'rejectPendingRequest') {
        let pendingRequestBid = currentBids.pendingRequest;
        const invalidReason = invalidReasonForPendingRequestBid(nextAction, pendingRequestBid);
        if(invalidReason !== undefined) {
            engine.__actionReactionLogger.__logInvalidBidReason(invalidReason);
            return false;
        }
        pendingRequestBid = pendingRequestBid as Placed<SetBid<any, any>>; // is not undefined because of the invalidReasonsForPendingRequestBid check
        reactToRejectAction(pendingRequestBid.rule, currentBids.event);
        engine.__actionReactionLogger.__onActionProcessed({...nextAction, id: nextActionId});
        return true;
    }
    throw new Error('unexpected error: processAction was called with an invalid action type');
}