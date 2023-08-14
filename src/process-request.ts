import { RequestedAction, RequestedAsyncAction } from "./action.ts";
import { explainValidation } from "./payload-validation.ts";
import { ActionReactionLogger } from "./action-reaction-logger.ts";
import { OrderedRequestsAndCurrentBids, CurrentBidsForEvent, getHighestPriorityAskForBid, askFor, request } from "./bid.ts";
import { reactToRequestedAction, reactToRequestedAsyncAction } from "./flow-reaction.ts";
import { isThenable } from "./utils.ts";
import { invalidReasonsForRequestBid } from "./bid-invalid-reasons.ts";


/**
 * @internal
 * process the next valid action from all request bids. If a valid bid is found, the bid is processed and the function returns true.
 * @param info the information about bids and pending events
 * @param nextActionId the id of the next action that will be processed
 * @param logger the logger that is used to log invalid bids, invalid payloads and processed actions
 * @returns true if there was a valid bid that was processed, false if no valid bid was found
 */
export function processNextValidRequestBid(info: OrderedRequestsAndCurrentBids, nextActionId: number, logger: ActionReactionLogger, mockRequest?: boolean): boolean {
    return info.orderedRequests.some(bid => {
        let currentBids = info.currentBidsByEventId.get(bid.event.id);
        const invalidReasons = invalidReasonsForRequestBid(bid, currentBids);
        if(invalidReasons !== undefined) {
            return false;
        }
        currentBids = currentBids as CurrentBidsForEvent<any, any>; // is not undefined because of the invalidReasonsForRequestBid check
        // all checks passed, the bid payload can now be validated.
        // First, check if the payload is a function, if so, call it with the current event value
        let payload: any;
        if(mockRequest) {
            payload = new Promise(() => null);
        } else {
            payload = bid.payload instanceof Function ? bid.payload(bid.event.value) : bid.payload;
        }
        // if the payload is a promise, the payload can not be checked. A requestedAsyncAction will be created
        // and the payload will be checked, when the requestedAsyncAction is processed.
        if(isThenable(payload)) {
            const requestedAsyncAction: RequestedAsyncAction<any> = {
                id: nextActionId,
                type: 'requestedAsync',
                eventId: bid.event.id,
                payload: payload,
                bidId: bid.id,
                flowPath: bid.flow.path
            }
            reactToRequestedAsyncAction(currentBids, requestedAsyncAction, bid);
            logger.__onActionProcessed(requestedAsyncAction);
            return true;
        } else {
            const highestPriorityAskForBid = bid.isTriggerAskedFor ? getHighestPriorityAskForBid(currentBids) : undefined;
            const payloadValidation = explainValidation(currentBids, payload, [bid, bid.isTriggerAskedFor ? highestPriorityAskForBid : undefined]);
            if(!payloadValidation.isValidAccumulated) {
                return false;
            }
            // all checks passed, the bid is valid and will be processed
            const requestedAction: RequestedAction<any> = {
                id: nextActionId,
                type: 'requested',
                eventId: bid.event.id,
                payload: payload,
                bidId: bid.id,
                flowPath: bid.flow.path
            };
            reactToRequestedAction(currentBids, requestedAction, bid, highestPriorityAskForBid);
            logger.__onActionProcessed(requestedAction);
            return true;
        }
    });
}