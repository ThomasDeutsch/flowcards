import { Action, RejectPendingRequestAction } from "./action.ts";
import { explainValidation } from "./payload-validation.ts";
import { ActionReactionLogger } from "./action-reaction-logger.ts";
import { reactToExternalAction, reactToRejectAction, reactToResolveAsyncAction } from "./flow-reaction.ts";
import { invalidReasonsForPendingRequestBid } from "./bid-invalid-reasons.ts";
import { OrderedRequestsAndCurrentBids, Placed, RequestBid, getHighestPriorityAskForBid } from "./bid.ts";

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
export function processAction<P, V>(orderedRequestsAndCurrentBids: OrderedRequestsAndCurrentBids, nextActionId: number, logger: ActionReactionLogger, nextAction?: Action<any>): boolean {
    if(nextAction === undefined) return false;
    const currentBids = orderedRequestsAndCurrentBids.currentBidsByEventId.get(nextAction.eventId);
    // check if the event information is available (if any bid is placed for this event id)
    if(currentBids === undefined) {
        return false;
    }

    // A. external action
    if(nextAction.type === 'external') {
        // no checks needed for an external action, because all checks are done inside the event dispatch function.
        const highestPriorityAskForBid = getHighestPriorityAskForBid(currentBids)!;
        reactToExternalAction(currentBids, {...nextAction, id: nextActionId}, highestPriorityAskForBid);
        logger.__onActionProcessed({...nextAction, id: nextActionId});
        return true;
    }

    // B. resolvePendingRequest
    if(nextAction.type === 'resolvePendingRequest') {
        let pendingRequestBid = currentBids.pendingRequest;
        const invalidReasons = invalidReasonsForPendingRequestBid(nextAction, pendingRequestBid);
        if(invalidReasons !== undefined) {
            return false;
        }
        pendingRequestBid = pendingRequestBid as Placed<RequestBid<any, any>>; // is not undefined because of the invalidReasonsForPendingRequestBid check
        const validationResult = explainValidation(currentBids, nextAction.payload, [pendingRequestBid, pendingRequestBid.isTriggerAskedFor ? currentBids.askFor![0] : undefined]);
        if(!validationResult.isValidAccumulated) {
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
            logger.__onActionProcessed(rejectAction);
            return true;
        }
        reactToResolveAsyncAction(currentBids, {...nextAction, id: nextActionId}, pendingRequestBid);
        logger.__onActionProcessed({...nextAction, id: nextActionId});
        return true;
    }

    // C. rejectPendingRequest
    if(nextAction.type === 'rejectPendingRequest') {
        let pendingRequestBid = currentBids.pendingRequest;
        const invalidReasons = invalidReasonsForPendingRequestBid(nextAction, pendingRequestBid);
        if(invalidReasons !== undefined) {
            return false;
        }
        pendingRequestBid = pendingRequestBid as Placed<RequestBid<any, any>>; // is not undefined because of the invalidReasonsForPendingRequestBid check
        reactToRejectAction(pendingRequestBid.flow, currentBids.event);
        logger.__onActionProcessed({...nextAction, id: nextActionId});
        return true;
    }
    return false;
}