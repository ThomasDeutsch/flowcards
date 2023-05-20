import { RequestedAction, RequestedAsyncAction } from "./action";
import { explainValidation, isValidReturn } from "./payload-validation";
import { ActionReactionLogger } from "./action-reaction-logger";
import { EventInformation, PlacedRequestBid, RequestingBidsAndEventInformation } from "./bid";
import { reactToRequestedAction, reactToRequestedAsyncAction } from "./flow-reaction";
import { isThenable, mapValues } from "./utils";
import { invalidReasonsForRequestBid } from "./bid-invalid-reasons";


/**
 * @internal
 * process the next valid action from all request bids. If a valid bid is found, the bid is processed and the function returns true.
 * @param info the information about bids and pending events
 * @param nextActionId the id of the next action that will be processed
 * @param logger the logger that is used to log invalid bids, invalid payloads and processed actions
 * @returns true if there was a valid bid that was processed, false if no valid bid was found
 */
export function processNextValidRequestBid(info: RequestingBidsAndEventInformation, nextActionId: number, logger: ActionReactionLogger): boolean {
    // from all the request bids that are placed
    return mapValues(info.requested).some(<P,V>(bids: PlacedRequestBid<P, V>[]) => {
        // check if there is a valid bid that will be processed
        return bids.some(bid => {
            let eventInfo = info.eventInformation.get(bid.event.id);
            const invalidReasons = invalidReasonsForRequestBid(bid, eventInfo);
            if(invalidReasons !== undefined) {
                logger.logInvalidRequestBid(bid, invalidReasons); //TODO
                return false;
            }
            eventInfo = eventInfo as EventInformation<P, V>; // is not undefined because of the invalidReasonsForRequestBid check
            // all checks passed, the bid payload can now be validated.
            // First, check if the payload is a function, if so, call it with the current event value
            const payload = bid.payload instanceof Function ? bid.payload(bid.event.value) : bid.payload;
            // if the payload is a promise, the payload can not be checked. A requestedAsyncAction will be created
            // and the payload will be checked, when the requestedAsyncAction is processed.
            if(isThenable(payload)) {
                const requestedAsyncAction: RequestedAsyncAction<P> = {
                    id: nextActionId,
                    type: 'requestedAsync',
                    eventId: bid.event.id,
                    payload: payload,
                    bidId: bid.id,
                    flowId: bid.flow.id
                }
                reactToRequestedAsyncAction(eventInfo, requestedAsyncAction, bid);
                logger.onActionProcessed(requestedAsyncAction);
                return true;
            } else {
                // if the payload is not a promise, the payload can be checked immediately
                // if the bid is only valid when asked for, the highest priority askFor bid is also used to validate the payload
                const highestPriorityAskForBid = eventInfo.askFor[0];
                const payloadValidation = explainValidation(eventInfo, payload, [bid, bid.onlyWhenAskedFor ? highestPriorityAskForBid : undefined]);
                if(!payloadValidation.isValidAccumulated) {
                    logger.logInvalidPayload(bid, payloadValidation);
                    return false;
                }
                // all checks passed, the bid is valid and will be processed
                const requestedAction: RequestedAction<P> = {
                    id: nextActionId,
                    type: 'requested',
                    eventId: bid.event.id,
                    payload: payload,
                    bidId: bid.id,
                    flowId: bid.flow.id
                };
                reactToRequestedAction(eventInfo, requestedAction, bid);
                logger.onActionProcessed(requestedAction);
                return true;
            }
        });
    })
}