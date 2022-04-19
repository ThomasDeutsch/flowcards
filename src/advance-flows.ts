import { AnyAction, RejectAction, RequestedAction, RequestedAsyncAction, ResolveAction, ResolveExtendAction, TriggeredAction, UIAction } from './action';
import { EventCore } from './event-core';
import { Staging } from 'staging';
import { explainExtend, isValidReturn } from 'guard';
import { isSameNameKeyId, NameKeyId } from 'name-key-map';
import { PlacedExtendBid } from 'bid';


function progressWaitingFlows(event: EventCore<unknown>, staging: Staging, action: AnyAction): void {
    const bids = staging.getPlacedBids('waitForBid', action.eventId);
    if(bids === undefined) return;
    bids.forEach(bid => {
        if(isSameNameKeyId(bid.flowId, action.flowId)) return; // TODO: the waitfor is already progressed.
        if(bid.guard === undefined) {
            staging.getFlow(bid.flowId)?.progressBid(event, bid);
            return;
        }
        const validationResult = bid.guard(action.payload);
        if(isValidReturn(validationResult)) {
            staging.getFlow(bid.flowId)?.progressBid(event, bid);
        }
    });
}


function progressBid(event: EventCore<unknown>, staging: Staging, action: {flowId: NameKeyId, bidId: number, payload?: any}): void {
    const flow = staging.getFlow(action.flowId);
    if(flow === undefined) return;
    const bid = flow?.getBid(action.bidId);
    if(bid === undefined) return;
    event.__setValue(action.payload);
    flow.progressBid(event, bid);
}


function extendAction<P, V>(event: EventCore<P, V>, staging: Staging, extendedAction: AnyAction): boolean {
    const matchingExtendBids = staging.getPlacedBids('extendBid', extendedAction.eventId);
    if(matchingExtendBids === undefined) return false;
    while(matchingExtendBids && matchingExtendBids.length > 0) {
        const extendBid = matchingExtendBids.shift()! as PlacedExtendBid<P,V>; // get bid with highest priority
        if(event.isPending === false) {
            const explain = explainExtend(event, extendBid, extendedAction.payload as P);
            if(explain.isValid === false) continue;
        }
        const extendedActionType = extendedAction.type === 'resolvedExtendAction' ? extendedAction.extendedActionType : extendedAction.type;
        const extendingFlow = staging.getFlow(extendBid.flowId)!;
        extendingFlow.addPendingExtend(extendedAction.eventId, {
            extendedActionType,
            value: extendedAction.payload,
            event,
            extendedFlowId: extendedAction.flowId,
            extendedBidId: extendedAction.bidId
        });
        staging.addExtend(event.id, extendingFlow.id);
        if(event.isPending === false) {
            extendingFlow.progressBid(event, extendBid);
        }
        return true;
    }
    return false;
}


export function advanceTriggeredAction(event: EventCore<unknown>, staging: Staging, action: TriggeredAction): void {
    if(extendAction(event, staging, action)) return;
    progressBid(event, staging, action);
    progressBid(event, staging, {flowId: action.askForBid.flowId, bidId: action.askForBid.bidId, payload: action.payload});
    progressWaitingFlows(event, staging, action);
}


export function advanceRequestedAction(event: EventCore<unknown>, staging: Staging, action: RequestedAction): void {
    if(extendAction(event, staging, action)) return;
    progressBid(event, staging, action);
    progressWaitingFlows(event, staging, action);
}


export function advanceUiAction(event: EventCore<any, any>, staging: Staging, action: UIAction): void {
    if(extendAction(event, staging, action)) return;
    progressBid(event, staging, action);
    progressWaitingFlows(event, staging, action);
}


export function advanceAsyncRequest(event: EventCore<any, any>, staging: Staging, action: RequestedAsyncAction): void {
    staging.addPendingRequest(action);
    extendAction(event, staging, action)
}


export function advanceResolveAction(event: EventCore<unknown>, staging: Staging, action: ResolveAction): void {
    staging.removePending('request', action.eventId);
    const wasExtended = extendAction(event, staging, action);
    if(wasExtended) return;
    const requestedAction: RequestedAction = {
        id: action.id,
        flowId: action.flowId,
        eventId: action.eventId,
        bidId: action.bidId,
        type: "requestedAction",
        payload: action.payload
    };
    advanceRequestedAction(event, staging, requestedAction);
}


export function advanceResolveExtendAction(event: EventCore<any, any>, staging: Staging, action: ResolveExtendAction): void {
    staging.removePending('extend', action.eventId);
    const wasExtended = extendAction(event, staging, action);
    if(wasExtended) return;
    if(action.extendedActionType === 'requestedAction' || action.extendedActionType === 'resolveAction' || action.extendedActionType === 'requestedAsyncAction') {
        const extendAction: RequestedAction = {...action, type: 'requestedAction'}
        advanceRequestedAction(event, staging, extendAction);
    }
    if(action.extendedActionType === 'triggeredAction') {
        const extendAction: TriggeredAction = {...action, type: 'triggeredAction', askForBid: action.askForBid!}
        advanceTriggeredAction(event, staging, extendAction);
    }
    if(action.extendedActionType === 'uiAction') {
        const extendAction: UIAction = {...action, type: 'uiAction'}
        advanceUiAction(event, staging, extendAction);
    }
}


export function advanceRejectAction(event: EventCore<unknown>, staging: Staging, action: RejectAction): void {
    const flow = staging.getFlow(event.extendedBy || action.flowId);
    if(flow === undefined) {
        console.warn('no flow found for this reject action: ', action);
        return;
    }
    staging.removePending('request', action.eventId);
    flow.throwError(event, action.error);
}