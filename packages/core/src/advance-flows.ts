import { NameKeyId } from './name-key-map';
import { RequestedAction } from './action';
import { getAllPayloadValidationCallbacks, isValidPayload, isValidReturn } from './validation';
import { FlowMap } from './update-loop';
import { AllPlacedBids } from './bid';
import { EventCore } from './flow-event';
import { AnyAction, RejectAction, ResolveAction, ResolveExtendAction, TriggeredAction, UIAction } from '.';


export function progressWaitingFlows(allPlacedBids: AllPlacedBids, flowMap: FlowMap, eventId: NameKeyId, payload: unknown): void {
    const bids = allPlacedBids.waitForBid.get(eventId);
    if(bids === undefined) return;
    bids.forEach(bid => {
        if(bid.payloadValidationCB === undefined) {
            flowMap.get(bid.flowId)?.progressBid(bid);
            return;
        }
        const validationResult = bid.payloadValidationCB(payload);
        if(isValidReturn(validationResult)) {
            flowMap.get(bid.flowId)?.progressBid(bid);
        }
    });
}


function extendAction(event: EventCore<unknown>, allPlacedBids: AllPlacedBids, flowMap: FlowMap, extendedAction: AnyAction): boolean {
    const matchingExtendBids = allPlacedBids.extendBid.get(extendedAction.eventId);
    if(matchingExtendBids === undefined) return false;
    const validationBids = allPlacedBids.validateBid.get(extendedAction.eventId);
    while(matchingExtendBids && matchingExtendBids.length > 0) {
        const extendBid = matchingExtendBids.shift()!; // get bid with highest priority
        const validationCallbacks = getAllPayloadValidationCallbacks([extendBid, ...(validationBids || [])]);
        if(isValidPayload(validationCallbacks, extendedAction.payload) !== true) continue;
        const extendedType = extendedAction.type === 'resolvedExtendAction' ? extendedAction.extendedActionType : extendedAction.type;
        event.__addPendingExtend(extendBid, extendedAction.payload, extendedType, extendedAction.flowId, extendBid.flowId);
        const extendingFlow = flowMap.get(extendBid.flowId)!;
        extendingFlow.progressBid(extendBid);
        return true;
    }
    return false;
}


export function advanceTriggeredAction(event: EventCore<unknown>, flowMap: FlowMap, allPlacedBids: AllPlacedBids, action: TriggeredAction): void {
    const wasExtended = extendAction(event, allPlacedBids, flowMap, action);
    if(wasExtended) return;
    event.__setValue(action.payload);
    const triggerBids = allPlacedBids.triggerBid.get(action.eventId)!;
    triggerBids.forEach(bid => {
        flowMap.get(bid.flowId)!.progressBid(bid);
    });
    const askForBids = allPlacedBids.askForBid.get(action.eventId)!;
    askForBids.forEach(bid => {
        flowMap.get(bid.flowId)!.progressBid(bid);
    });
    progressWaitingFlows(allPlacedBids, flowMap, action.eventId, action.payload);
}


export function advanceRequestedAction(event: EventCore<unknown>, flowMap: FlowMap, allPlacedBids: AllPlacedBids, action: RequestedAction): void {
    const wasExtended = extendAction(event, allPlacedBids, flowMap, action);
    if(wasExtended) return;
    event.__setValue(action.payload);
    const requestBids = allPlacedBids.requestBid.get(action.eventId)!;
    requestBids.forEach(bid => {
        flowMap.get(bid.flowId)!.progressBid(bid);
    });
    progressWaitingFlows(allPlacedBids, flowMap, action.eventId, action.payload);
}


export function advanceUiAction(event: EventCore<any, any>, flowMap: FlowMap, allPlacedBids: AllPlacedBids, action: UIAction): void {
    const wasExtended = extendAction(event, allPlacedBids, flowMap, action);
    if(wasExtended) return;
    event.__setValue(action.payload);
    const askForBids = allPlacedBids.askForBid.get(action.eventId)!;
    askForBids.forEach(bid => {
        flowMap.get(bid.flowId)!.progressBid(bid);
    });
    progressWaitingFlows(allPlacedBids, flowMap, action.eventId, action.payload);
}


export function advanceResolveAction(event: EventCore<unknown>, flowMap: FlowMap, allPlacedBids: AllPlacedBids, action: ResolveAction): void {
    event.__removePending();
    const wasExtended = extendAction(event, allPlacedBids, flowMap, action);
    if(wasExtended) return;
    const requestedAction: RequestedAction = {
        id: action.id,
        flowId: action.flowId,
        eventId: action.eventId,
        type: "requestedAction",
        payload: action.payload
    };
    advanceRequestedAction(event, flowMap, allPlacedBids, requestedAction);
}


export function advanceResolveExtendAction(event: EventCore<unknown>, flowMap: FlowMap, allPlacedBids: AllPlacedBids, action: ResolveExtendAction): void {
    event.__removePending();
    const wasExtended = extendAction(event, allPlacedBids, flowMap, action);
    if(wasExtended) return;
    if(action.extendedActionType === 'requestedAction' || action.extendedActionType === 'resolveAction') {
        const extendAction: RequestedAction = {
            id: action.id,
            type: 'requestedAction',
            flowId: action.flowId,
            eventId: action.eventId,
            payload: action.payload
        }
        advanceRequestedAction(event, flowMap, allPlacedBids, extendAction);
    }
    if(action.extendedActionType === 'triggeredAction') {
        const extendAction: TriggeredAction = {
            id: action.id,
            type: action.extendedActionType,
            flowId: action.flowId,
            eventId: action.eventId,
            payload: action.payload
        }
        advanceTriggeredAction(event, flowMap, allPlacedBids, extendAction);
    }
    if(action.extendedActionType === 'uiAction') {
        const extendAction: UIAction = {
            id: action.id,
            type: action.extendedActionType,
            flowId: action.flowId,
            eventId: action.eventId,
            payload: action.payload
        }
        advanceUiAction(event, flowMap, allPlacedBids, extendAction);
    }
}


export function advanceRejectAction(event: EventCore, flowMap: FlowMap, allPlacedBids: AllPlacedBids, action: RejectAction): void {
    event.__removePending();
    const catchErrorBids = allPlacedBids.catchErrorBid.get(action.eventId);
    if(catchErrorBids) {
        catchErrorBids.forEach(bid => {
            flowMap.get(bid.flowId)?.progressBid(bid);
        });
        return;
    }
    else {
        flowMap.get(action.flowId)?.throwError(action.eventId, action.error);
    }
}
