import { Action, RejectPendingRequestAction } from "./action.ts";
import { Engine } from "./engine.ts";
import { explainValidation } from "./payload-validation.ts";
import { reactToInputAction, reactToRejectAction, reactToResolveAsyncAction } from "./flow-reaction.ts";
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
            return false;
        }
        if(accumulatedValidationResults && accumulatedValidationResults.isValidAccumulated === false) {
            engine.__actionReactionLogger.__logInvalidPayload(accumulatedValidationResults);
            return false;
        }
        const action = {...nextAction, id: nextActionId};
        if(whenBid === undefined) {
            throw new Error('unexpected error: after bid validation, the when-bid should not be undefined');
        }
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
    if(nextAction.type === 'rejectPendingRequest') {
        let pendingRequestBid = currentBids.pendingRequest;
        const invalidReason = invalidReasonForPendingRequestBid(nextAction, pendingRequestBid);
        if(invalidReason !== undefined) {
            engine.__actionReactionLogger.__logInvalidBidReason(invalidReason);
            return false;
        }
        pendingRequestBid = pendingRequestBid as Placed<SetBid<any, any>>; // is not undefined because of the invalidReasonsForPendingRequestBid check
        reactToRejectAction(pendingRequestBid.flow, currentBids.event);
        engine.__actionReactionLogger.__onActionProcessed({...nextAction, id: nextActionId});
        return true;
    }
    throw new Error('unexpected error: processAction was called with an invalid action type');
}