import { Action, ExtendableAction, InputAction, RequestedAction, RequestedAsyncAction, ResolvePendingRequestAction } from "./action.ts";
import { isValidReturn, validateBid } from "./payload-validation.ts";
import { WhenBid, BidType, CurrentBidsForEvent, Placed, ProgressingBid, SetBid } from "./bid.ts";
import { Event } from "./event.ts";
import { Flow } from "./flow.ts";
import { ExtendInformation } from "./flow.ts";

export type FlowReaction = {flowPath: string[], type: FlowReactionType, details: FlowReactionDetails};

export type FlowReactionType =
    'flow enabled' |
    'flow progressed on a bid' |
    'flow progressed on a handled error' |
    'pending extend added' |
    'pending extend resolved' |
    'pending extend cancelled' |
    'pending extend aborted' |
    'pending request added' |
    'pending request resolved' |
    'pending request cancelled' |
    'pending request rejected' |
    'flow disabled' |
    'flow ended' |
    'flow enabled, after being disabled' |
    'flow ended because an error on the first bid was not handled' |
    'flow restarted manually by calling flow.restart' |
    'flow restarted because an error was not handled' |
    'flow restarted because the value of a given event changed' |
    'an active given was added'


export interface FlowReactionDetails {
    eventId?: string;
    bidId?: number;
    bidType?: string;
    actionId?: number;
    childFlowId?: string;
}

/**
 * @internal
 * handle given bids by restarting the flow if the bid is active, or by progressing the bid if the bid is not active - if the event value has changed
 * @param eventInfo the event info of the event
 */
export function progressGivenBids<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action:  InputAction<P> & {id: number} | RequestedAction<P> | ResolvePendingRequestAction<P> & {id: number}, eventValueHasChanged: boolean): void {
    eventInfo[BidType.given]?.forEach((givenBid) => {
        if(givenBid.isActive && eventValueHasChanged) {
            givenBid.flow.__restart(true);
        }
        else if(isValidReturn(validateBid<P, V>(givenBid, action.payload))) {
            givenBid.flow.__addActiveGivenBid(givenBid);
            givenBid.flow.__onEvent(givenBid.event, givenBid, action.id);
        }
    });
}


/**
 * @internal
 * react to an input action, by progressing the When bid and all waiting and other When bids
 * @param eventInfo the event info of the event
 * @param action the valid external action selected by the engine
 * @param whenBid the When bid
 */
 export function reactToInputAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: InputAction<P> & {id: number}, whenBid: Placed<WhenBid<P, V>>): void {
    eventInfo.pendingExtend?.extendingFlow?.__resolveExtend(eventInfo.event);
    if(progressExtendBid(eventInfo, action, whenBid)) return;
    // removed: a when bid will not set a value!
    // const eventValueHasChanged = eventInfo.event.__setValue(action.payload);
    const eventValueHasChanged = false;
    progressExtendedBids(eventInfo, action);
    progressGivenBids(eventInfo, action, eventValueHasChanged);
}

/**
 * @internal
 * react to a requested action, by progressing the request bid and a when bid.
 * @param eventInfo the event info of the event
 * @param action the valid requested action selected by the engine
 * @param requestBid the placed request bid
 */
 export function reactToRequestedAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: RequestedAction<P>  & {id: number}, requestBid: Placed<SetBid<P, V>>, whenBid?: Placed<WhenBid<P, V>>): void {
    eventInfo.pendingExtend?.extendingFlow?.abortExtend(eventInfo.event);
    if(progressExtendBid(eventInfo, action, requestBid)) return;
    const eventValueHasChanged = eventInfo.event.__setValue(action.payload);
    progressExtendedBids(eventInfo, action);
    requestBid.flow.__onEvent(requestBid.event, requestBid, action.id);
    whenBid?.flow.__onEvent(eventInfo.event, whenBid, action.id);
    progressGivenBids(eventInfo, action, eventValueHasChanged);
}

/**
 * @internal
 * react to a requested async action, by progressing the request bid
 * @param eventInfo the event info of the event
 * @param action the valid request async action selected by the engine
 * @param requestBid the placed request bid of the flow that holds the pending request.
 */
 export function reactToRequestedAsyncAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: RequestedAsyncAction<P>, requestBid: Placed<SetBid<P, V>>): void {
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
 export function reactToResolveAsyncAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: ResolvePendingRequestAction<P> & {id: number}, pendingRequest: Placed<SetBid<P,V>>): void {
    pendingRequest.flow.__resolvePendingRequest(eventInfo.event);
    eventInfo.pendingExtend?.extendingFlow?.__resolveExtend(eventInfo.event);
    if(progressExtendBid(eventInfo, action, pendingRequest)) return;
    const eventValueHasChanged = eventInfo.event.__setValue(action.payload);
    progressExtendedBids(eventInfo, action);
    eventInfo.pendingRequest = undefined;
    pendingRequest.flow.__onEvent(eventInfo.event, pendingRequest ,action.id);
    progressGivenBids(eventInfo, action, eventValueHasChanged);
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
 * @param action the valid action selected by the engine
 * @param extendedBid the placed bid bid that may get extended (relevant if an event is already extended)
 */
 function progressExtendBid<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: ExtendableAction<P> & {id: number}, extendedBid: Placed<ProgressingBid<P,V>>): Flow | undefined {
    if(!eventInfo.extend?.length) return
    const bid = eventInfo.extend.find((extend) => isValidReturn(validateBid<P, V>(extend, action.payload as P)));
    if(bid === undefined) return undefined;
    const extendInformation: ExtendInformation<P,V> = {
        value: action.payload,
        event: eventInfo.event,
        extendedBids: eventInfo.pendingExtend ? [extendedBid, ...eventInfo.pendingExtend.extendedBids] : [extendedBid],
    }
    // set the pending extend directly to the event info, so that the extended event will get all the information it needs as soon as the __onExtend is called and the flow progresses.
    eventInfo.pendingExtend = extendInformation;
    const extendingFlow = bid.flow.flow(`extending_${bid.event.id}_${bid.id}`, bid.extendingFlow, false, extendInformation);
    return extendingFlow;
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