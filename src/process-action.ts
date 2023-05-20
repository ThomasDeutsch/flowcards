import { Action } from "./action";
import { explainValidation } from "./payload-validation";
import { ActionReactionLogger } from "./action-reaction-logger";
import { RequestingBidsAndEventInformation } from "./bid";
import { reactToExternalAction, reactToRejectAction, reactToResolveAsyncAction } from "./flow-reaction";
import { invalidReasonsForPendingRequestBid } from "./bid-invalid-reasons";

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
export function processAction<P, V>(info: RequestingBidsAndEventInformation, nextActionId: number, logger: ActionReactionLogger, nextAction?: Action<any>): boolean {
    if(nextAction === undefined) return false;
    const eventInfo = info.eventInformation.get(nextAction.eventId);
    // check if the event information is available (if any bid is placed for this event id)
    if(eventInfo === undefined) {
        logger.logInvalidAction(nextAction, [{reason: 'no event information'}]);
        return false;
    }

    // A. external action
    if(nextAction.type === 'external') {
        // no checks needed for an external action, because all checks are done inside the event dispatch function.
        const highestPriorityAskForBid = eventInfo.askFor[0];
        reactToExternalAction(eventInfo, {...nextAction, id: nextActionId}, highestPriorityAskForBid);
        logger.onActionProcessed({...nextAction, id: nextActionId});
        return true;
    }

    // B. resolvePendingRequest
    if(nextAction.type === 'resolvePendingRequest') {
        let pendingRequestBid = eventInfo.pendingRequest;
        const invalidReasons = invalidReasonsForPendingRequestBid(nextAction, pendingRequestBid);
        if(invalidReasons !== undefined) {
            logger.logInvalidAction(nextAction, invalidReasons);
            return false;
        }
        pendingRequestBid = pendingRequestBid as PlacedRequestBid<any, any>; // is not undefined because of the invalidReasonsForPendingRequestBid check
        const validationResult = explainValidation(eventInfo, nextAction.payload, [pendingRequestBid, pendingRequestBid.onlyWhenAskedFor ? eventInfo.askFor[0] : undefined]);
        if(!validationResult.isValidAccumulated) {
            logger.logInvalidAction(nextAction, validationResult);
            return false;
        }
        reactToResolveAsyncAction(eventInfo, {...nextAction, id: nextActionId}, pendingRequestBid);
        logger.onActionProcessed({...nextAction, id: nextActionId});
        return true;
    }

    // C. rejectPendingRequest
    if(nextAction.type === 'rejectPendingRequest') {
        let pendingRequestBid = eventInfo.pendingRequest;
        const invalidReasons = invalidReasonsForPendingRequestBid(nextAction, pendingRequestBid);
        if(invalidReasons !== undefined) {
            logger.logInvalidAction(nextAction, invalidReasons);
            return false;
        }
        pendingRequestBid = pendingRequestBid as PlacedRequestBid<any, any>; // is not undefined because of the invalidReasonsForPendingRequestBid check
        reactToRejectAction(pendingRequestBid.flow, eventInfo.event);
        logger.onActionProcessed({...nextAction, id: nextActionId});
        return true;
    }
    return false;
}