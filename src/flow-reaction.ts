import { Action, ExtendableAction, ExternalAction, RequestedAction, RequestedAsyncAction, ResolvePendingRequestAction } from "./action.ts";
import { isValidReturn, validateBid } from "./payload-validation.ts";
import { AskForBid, BidType, CurrentBidsForEvent, Placed, ProgressingBid, RequestBid } from "./bid.ts";
import { Event } from "./event.ts";
import { Flow, PendingExtend } from "./flow.ts";
import { WaitingBid } from "../dist/ucflows.d.ts";

export type FlowReaction = {flowPath: string[], type: FlowReactionType, details: FlowReactionDetails};

export type FlowReactionType =
    'flow enabled' |
    'flow progressed on a bid' |
    'flow progressed on a handled error' |
    'pending extend added' |
    'pending extend resolved' |
    'pending extend aborted' |
    'pending request added' |
    'pending request resolved' |
    'pending request cancelled' |
    'flow disabled' |
    'flow ended' |
    'flow enabled, after being disabled' |
    'flow restarted manually by calling flow.restart' |
    'flow restarted because an error was not handled';


export interface FlowReactionDetails {
    eventId?: string;
    bidId?: number;
    bidType?: string;
    actionId?: number;
    childFlowId?: string;
}

/**
 * @internal
 * react to an external action, by progressing the askFor bid and all waiting and other askFor bids
 * @param eventInfo the event info of the event
 * @param action the valid external action selected by the scheduler
 * @param askForBid the askFor bid
 */
 export function reactToExternalAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: ExternalAction<P> & {id: number}, askForBid: Placed<AskForBid<P, V>>): void {
    eventInfo.pendingExtend?.extendingFlow.__resolveExtend(eventInfo.event);
    if(progressExtendBid(eventInfo, action, askForBid)) return;
    eventInfo.event.__setValue(action.payload);
    progressExtendedBids(eventInfo, action);
    progressWaitingBids(eventInfo, action);
}

/**
 * @internal
 * react to a requested action, by progressing the request bid and waitFor and askFor bids.
 * @param eventInfo the event info of the event
 * @param action the valid requested action selected by the scheduler
 * @param requestBid the placed request bid
 */
 export function reactToRequestedAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: RequestedAction<P>  & {id: number}, requestBid: Placed<RequestBid<P, V>>, askForBid?: Placed<AskForBid<P, V>>): void {
    eventInfo.pendingExtend?.extendingFlow.abortExtend(eventInfo.event);
    if(progressExtendBid(eventInfo, action, requestBid)) return;
    eventInfo.event.__setValue(action.payload);
    progressExtendedBids(eventInfo, action);
    requestBid.flow.__onEvent(requestBid.event, requestBid, action.id);
    askForBid?.flow.__onEvent(eventInfo.event, askForBid, action.id);
    progressWaitingBids(eventInfo, action);
}

/**
 * @internal
 * react to a requested async action, by progressing the request bid and waitFor and askFor bids
 * @param eventInfo the event info of the event
 * @param action the valid request async action selected by the scheduler
 * @param requestBid the placed request bid of the flow that holds the pending request.
 */
 export function reactToRequestedAsyncAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: RequestedAsyncAction<P>, requestBid: Placed<RequestBid<P, V>>): void {
    const extendingFlow = progressExtendBid(eventInfo, action, requestBid)
    if(extendingFlow) {
        // if the pending request gets extended, the extending flow will receive the pending event info. In this case, the extending flow is able to cancel the event if needed.
        extendingFlow.__onRequestedAsync({...requestBid, flow: extendingFlow}, action.payload, action.id);
    }
    else {
        requestBid.flow.__onRequestedAsync(requestBid, action.payload, action.id);
    }
}

/**
 * @internal
 * react to a resolve pending request action
 * @param eventInfo the event info of the event
 * @param action the selected action
 */
 export function reactToResolveAsyncAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: ResolvePendingRequestAction<P> & {id: number}, pendingRequest: Placed<RequestBid<P,V>>): void {
    pendingRequest.flow.__resolvePendingRequest(eventInfo.event);
    eventInfo.pendingExtend?.extendingFlow.__resolveExtend(eventInfo.event);
    if(progressExtendBid(eventInfo, action, pendingRequest)) return;
    eventInfo.event.__setValue(action.payload);
    progressExtendedBids(eventInfo, action);
    eventInfo.pendingRequest = undefined;
    pendingRequest.flow.__onEvent(eventInfo.event, pendingRequest ,action.id);
    progressWaitingBids(eventInfo, action);
}

/**
 * @internal
 * react to a reject action
 * @param eventInfo the event info of the event
 * @param action the reject action
 */
 export function reactToRejectAction(flow: Flow, event: Event<any, any>): void {
    flow.__onRejectAsyncAction(event);
}


// HELPERS ------------------------------------------------------------------------------------------------------------


/**
 * @internal
 * extend an action when a flow has placed a valid extend bid and the bid is valid
 * @param eventInfo the event info of the event that could be extended
 * @param action the valid action selected by the scheduler
 * @param extendedBid the placed bid bid that may get extended
 */
 function progressExtendBid<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: ExtendableAction<P> & {id: number}, extendedBid: Placed<ProgressingBid<P,V>>): Flow | undefined {
    if(!eventInfo.extend?.length) return
    const bid = eventInfo.extend.find((extend) => isValidReturn(validateBid<P, V>(extend, action.payload as P)));
    if(bid === undefined) return undefined;
    const extend: PendingExtend<P,V> = {
        value: action.payload,
        event: eventInfo.event,
        extendingFlow: bid.flow,
        extendedBids: eventInfo.pendingExtend ? [extendedBid, ...eventInfo.pendingExtend.extendedBids] : [extendedBid],
    }
    // set the pending extend directly to the event info, so that the extended event will get all the information it needs as soon as the __onExtend is called and the flow progresses.
    eventInfo.pendingExtend = extend;
    bid.flow.__onExtend(bid.event, bid, extend, action.id);
    return extend.extendingFlow;
}

/**
 * @internal
 * progress all waitFor bids placed by the flows
 * @param eventInfo the event info of the event that could be extended
 * @param action the valid action selected by the scheduler
 */
function progressWaitingBids<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action:  ExternalAction<P> & {id: number} | RequestedAction<P> | ResolvePendingRequestAction<P> & {id: number}): void {
    eventInfo[BidType.waitFor]?.forEach((waitFor) => {
        if(isValidReturn(validateBid<P, V>(waitFor, action.payload))) {
            waitFor.flow.__onEvent(waitFor.event, waitFor, action.id);
        }
    });
}

/**
 * @internal
 * progress all extended bids
 * @param eventInfo the event info of the the possibly extended event
 * @param action the selected action
 */
function progressExtendedBids(eventInfo: CurrentBidsForEvent<any, any>, action: Action<any> & {id: number}): void {
    if(eventInfo.pendingExtend) {
        const extendedBids = eventInfo.pendingExtend.extendedBids;
        eventInfo.pendingExtend = undefined;
        extendedBids.forEach((extendedBid) => {
            extendedBid?.flow.__onEvent(eventInfo.event, extendedBid, action.id);
        });
    }
}