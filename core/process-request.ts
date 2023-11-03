import { RequestedAction, RequestedAsyncAction } from "./action.ts";
import { explainValidation } from "./payload-validation.ts";
import { CurrentBidsForEvent } from "./bid.ts";
import { reactToRequestedAction, reactToRequestedAsyncAction } from "./flow-reaction.ts";
import { isThenable } from "./utils.ts";
import { invalidReasonForRequestBid } from "./bid-invalid-reasons.ts";
import { Engine } from "./engine.ts";


/**
 * @internal
 * process the next valid action from all request bids. If a valid bid is found, the bid is processed and the function returns true.
 * @param info the information about bids and pending events
 * @param nextActionId the id of the next action that will be processed
 * @param logger the logger that is used to log invalid bids, invalid payloads and processed actions
 * @returns true if there was a valid bid that was processed, false if no valid bid was found
 */
export function processNextValidRequestBid(engine: Engine, mockRequest?: boolean): boolean {
    const orderedRequestsAndCurrentBids = engine.orderedRequestsAndCurrentBids;
    return orderedRequestsAndCurrentBids.orderedRequests.some(bid => {
        let currentBids = orderedRequestsAndCurrentBids.currentBidsByEventId.get(bid.event.id);
        const invalidReasons = invalidReasonForRequestBid(bid, currentBids);
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
        const nextActionId = engine.currentActionId + 1;
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
            engine.__actionReactionLogger.__onActionProcessed(requestedAsyncAction);
            return true;
        }
        // payload is not a promise, so it can be checked
        if(bid.isTriggerAskedFor) {
            // for a trigger, check if for this event, a dispatch would be valid
            const {invalidBidReason, accumulatedValidationResults, askForBid} = bid.event.validate(payload);
            if(invalidBidReason || accumulatedValidationResults?.isValidAccumulated === false) {
                return false;
            }
            const requestedAction: RequestedAction<any> = {
                id: nextActionId,
                type: 'requested',
                eventId: bid.event.id,
                payload: payload,
                bidId: bid.id,
                flowPath: bid.flow.path
            };
            reactToRequestedAction(currentBids, requestedAction, bid, askForBid);
            engine.__actionReactionLogger.__onActionProcessed(requestedAction);
            return true;
        }
        else {
            // for a request, check if the payload is valid
            const payloadValidation = explainValidation(currentBids, payload, [bid]);
            if(payloadValidation.isValidAccumulated === false) {
                return false;
            }
            const requestedAction: RequestedAction<any> = {
                id: nextActionId,
                type: 'requested',
                eventId: bid.event.id,
                payload: payload,
                bidId: bid.id,
                flowPath: bid.flow.path
            };
            reactToRequestedAction(currentBids, requestedAction, bid);
            engine.__actionReactionLogger.__onActionProcessed(requestedAction);
            return true;
        }
    });
}