import { RequestedAction, RequestedAsyncAction } from "./action.ts";
import { explainValidation } from "./payload-validation.ts";
import { CurrentBidsForEvent } from "./bid.ts";
import { reactToRequestedAction, reactToRequestedAsyncAction } from "./rule-reactions.ts";
import { isThenable } from "./utils.ts";
import { invalidReasonForRequestBid } from "./bid-invalid-reasons.ts";
import { Engine } from "./engine.ts";

export function processNextValidRequestBid(engine: Engine, mockRequest?: boolean): boolean {
    const orderedRequestsAndCurrentBids = engine.orderedRequestsAndCurrentBids;
    return orderedRequestsAndCurrentBids.orderedRequests.some(bid => {
        let currentBids = orderedRequestsAndCurrentBids.currentBidsByEventId.get(bid.event.id);
        const invalidReasons = invalidReasonForRequestBid(bid, currentBids);
        if(invalidReasons !== undefined) {
            return false;
        }
        currentBids = currentBids as CurrentBidsForEvent<any, any>; 
        let payload: any;
        if(mockRequest) {
            payload = new Promise(() => null);
        } else {
            payload = bid.payload instanceof Function ? bid.payload(bid.event.value) : bid.payload;
        }
        const nextActionId = engine.currentActionId + 1;
        if(isThenable(payload)) {
            const requestedAsyncAction: RequestedAsyncAction<any> = {
                id: nextActionId,
                type: 'requestedAsync',
                eventId: bid.event.id,
                payload: payload,
                bidId: bid.id,
                rulePath: bid.rule.path
            }
            reactToRequestedAsyncAction(currentBids, requestedAsyncAction, bid);
            engine.__actionReactionLogger.__onActionProcessed(requestedAsyncAction);
            return true;
        }
        if(bid.isTrigger) {
            const {invalidBidReason, accumulatedValidationResults, whenBid} = bid.event.validate(payload);
            if(invalidBidReason || accumulatedValidationResults?.isValidAccumulated === false) {
                return false;
            }
            const requestedAction: RequestedAction<any> = {
                id: nextActionId,
                type: 'requested',
                eventId: bid.event.id,
                payload: payload,
                bidId: bid.id,
                rulePath: bid.rule.path
            };
            reactToRequestedAction(currentBids, requestedAction, bid, whenBid);
            engine.__actionReactionLogger.__onActionProcessed(requestedAction);
            return true;
        }
        else {
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
                rulePath: bid.rule.path
            };
            reactToRequestedAction(currentBids, requestedAction, bid);
            engine.__actionReactionLogger.__onActionProcessed(requestedAction);
            return true;
        }
    });
}