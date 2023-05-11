import { Action, ExtendableAction, ExternalAction, RequestedAction, RequestedAsyncAction, ResolvePendingRequestAction, TriggeredAction } from "./action";
import { isValidReturn, validateBid } from "./action-explain";
import { EventInformation, PlacedBid, PlacedRequestBid, PlacedTriggerBid, PlacedWaitingBid } from "./bid";
import { Event } from "./event";
import { Flow, PendingExtend } from "./flow";


// CORE FUNCTIONS -----------------------------------------------------------------------------------------------

/**
 * @internal
 * react to an external action, by progressing the askFor bid and all waiting bids
 * @param eventInfo the event info of the event
 * @param action the selected action
 */
 export function reactToExternalAction<P, V>(eventInfo: EventInformation<P, V>, action: ExternalAction<P> & {id: number}, askForBid: PlacedWaitingBid<P, V>): void {
    eventInfo.pendingExtend?.extendingFlow.abortExtend(eventInfo.event, true);
    if(progressExtendBid(eventInfo, action, askForBid)) return;
    eventInfo.event.__setValue(action.payload);
    if(eventInfo.pendingExtend) {
        const extendedBid = eventInfo.pendingExtend.extendedBid;
        eventInfo.pendingExtend = undefined;
        extendedBid?.flow.__onEvent(eventInfo.event, extendedBid, action.id);
    }
    progressWaitingBids(eventInfo, action);
}

/**
 * @internal
 * react to a requested action, by progressing the request bid and waitFor bids
 * @param eventInfo the event info of the event
 * @param requestBid the request bid
 * @param action the selected request action
 */
 export function reactToRequestedAction<P, V>(eventInfo: EventInformation<P, V>, action: RequestedAction<P>  & {id: number} | TriggeredAction<P>, requestBid: PlacedTriggerBid<P, V> | PlacedRequestBid<P, V>): void {
    eventInfo.pendingExtend?.extendingFlow.abortExtend(eventInfo.event, true);
    if(progressExtendBid(eventInfo, action, requestBid)) return;
    eventInfo.event.__setValue(action.payload);
    if(eventInfo.pendingExtend) {
        const extendedBid = eventInfo.pendingExtend.extendedBid;
        eventInfo.pendingExtend = undefined;
        extendedBid?.flow.__onEvent(eventInfo.event, extendedBid, action.id);
    }
    requestBid.flow.__onEvent(requestBid.event, requestBid, action.id);
    progressWaitingBids(eventInfo, action);
}

/**
 * @internal
 * react to a requested async action, by progressing the request bid and waitFor bids
 * @param eventInfo the event info of the event
 * @param action the selected request action
 */
 export function reactToRequestedAsyncAction<P, V>(eventInfo: EventInformation<P, V>, action: RequestedAsyncAction<P>, requestBid: PlacedRequestBid<P, V>): void {
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
 export function reactToResolveAsyncAction<P, V>(eventInfo: EventInformation<P, V>, action: ResolvePendingRequestAction<P> & {id: number}, pendingRequest: PlacedRequestBid<P,V>): void {
    pendingRequest.flow.__resolvePendingRequest(eventInfo.event);
    eventInfo.pendingExtend?.extendingFlow.abortExtend(eventInfo.event, true);
    if(progressExtendBid(eventInfo, action, pendingRequest)) return;
    eventInfo.event.__setValue(action.payload);
    if(eventInfo.pendingExtend) {
        const extendedBid = eventInfo.pendingExtend.extendedBid;
        eventInfo.pendingExtend = undefined;
        extendedBid?.flow.__onEvent(eventInfo.event, extendedBid, action.id);
    }
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
 * function to check if an action is extendable
 * @param action the action to be checked
 */
 function isExtendableAction<P>(action: Action<P>): action is ExtendableAction<P> {
    return (action.type === 'requested' || action.type === 'triggered' || action.type === 'external' || action.type === 'resolvePendingRequest' || action.type === 'requestedAsync');
}

/**
 * @internal
 * extend an action when a flow has placed a valid extend bid and the bid is valid
 * @param eventInfo the event info of the event that could be extended
 * @param action the action (extendable) to be extended
 */
 function progressExtendBid<P, V>(eventInfo: EventInformation<P, V>, action: Action<P> & {id: number}, extendedBid: PlacedBid<P,V>): Flow | undefined {
    if(!isExtendableAction(action)) return;
    if(eventInfo.extend.length === 0) return
    const bid = eventInfo.extend.find((extend) => isValidReturn(validateBid<P, V>(extend, action.payload as P)));
    if(bid === undefined) return undefined;
    const extend: PendingExtend<P,V> = {
        value: action.payload,
        event: eventInfo.event,
        extendingFlow: bid.flow,
        extendedBid: eventInfo.pendingExtend?.extendedBid || extendedBid
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
 * @param action the selected action
 */
function progressWaitingBids<P, V>(eventInfo: EventInformation<P, V>, action:  ExternalAction<P> & {id: number} | RequestedAction<P> | TriggeredAction<P> | ResolvePendingRequestAction<P> & {id: number}): void {
    eventInfo.waitFor.forEach((waitFor) => {
        if(isValidReturn(validateBid<P, V>(waitFor, action.payload))) {
            waitFor.flow.__onEvent(waitFor.event, waitFor, action.id);
        }
    });
    eventInfo.askFor.forEach((askFor) => {
        if(isValidReturn(validateBid<P, V>(askFor, action.payload))) {
            askFor.flow.__onEvent(askFor.event, askFor, action.id);
        }
    });
}