import { NameKeyId } from './name-key-map';
import { RequestedAction } from './action';
import { getAllPayloadValidationCallbacks, isValidPayload, isValidReturn } from './validation';
import { BThreadMap } from './update-loop';
import { AllPlacedBids } from './bid';
import { BEvent } from './b-event';
import { AnyAction, RejectAction, ResolveAction, ResolveExtendAction, TriggeredAction, UIAction } from '.';


export function progressWaitingBThreads(allPlacedBids: AllPlacedBids, bThreadMap: BThreadMap, eventId: NameKeyId, payload: unknown): void {
    const bids = allPlacedBids.waitForBid.get(eventId);
    if(bids === undefined) return;
    bids.forEach(bid => {
        if(bid.payloadValidationCB === undefined) {
            bThreadMap.get(bid.bThreadId)?.progressBid(bid);
            return;
        }
        const validationResult = bid.payloadValidationCB(payload);
        if(isValidReturn(validationResult)) {
            bThreadMap.get(bid.bThreadId)?.progressBid(bid);
        }
    });
}


function extendAction(event: BEvent<unknown>, allPlacedBids: AllPlacedBids, bThreadMap: BThreadMap, extendedAction: AnyAction): boolean {
    const matchingExtendBids = allPlacedBids.extendBid.get(extendedAction.eventId);
    if(matchingExtendBids === undefined) return false;
    const validationBids = allPlacedBids.validateBid.get(extendedAction.eventId);
    while(matchingExtendBids && matchingExtendBids.length > 0) {
        const extendBid = matchingExtendBids.shift()!; // get bid with highest priority
        const validationCallbacks = getAllPayloadValidationCallbacks([extendBid, ...(validationBids || [])]);
        if(isValidPayload(validationCallbacks, extendedAction.payload) !== true) continue;
        const extendedType = extendedAction.type === 'resolvedExtendAction' ? extendedAction.extendedActionType : extendedAction.type;
        event.__addPendingExtend(extendBid, extendedAction.payload, extendedType, extendedAction.bThreadId, extendBid.bThreadId);
        const extendingBThread = bThreadMap.get(extendBid.bThreadId)!;
        extendingBThread.progressBid(extendBid);
        return true;
    }
    return false;
}


export function advanceTriggeredAction(event: BEvent<unknown>, bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: TriggeredAction): void {
    const wasExtended = extendAction(event, allPlacedBids, bThreadMap, action);
    if(wasExtended) return;
    event.__setValue(action.payload);
    const triggerBids = allPlacedBids.triggerBid.get(action.eventId)!;
    triggerBids.forEach(bid => {
        bThreadMap.get(bid.bThreadId)!.progressBid(bid);
    });
    const askForBids = allPlacedBids.askForBid.get(action.eventId)!;
    askForBids.forEach(bid => {
        bThreadMap.get(bid.bThreadId)!.progressBid(bid);
    });
    progressWaitingBThreads(allPlacedBids, bThreadMap, action.eventId, action.payload);
}


export function advanceRequestedAction(event: BEvent<unknown>, bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: RequestedAction): void {
    const wasExtended = extendAction(event, allPlacedBids, bThreadMap, action);
    if(wasExtended) return;
    event.__setValue(action.payload);
    const requestBids = allPlacedBids.requestBid.get(action.eventId)!;
    requestBids.forEach(bid => {
        bThreadMap.get(bid.bThreadId)!.progressBid(bid);
    });
    progressWaitingBThreads(allPlacedBids, bThreadMap, action.eventId, action.payload);
}


export function advanceUiAction(event: BEvent<any, any>, bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: UIAction): void {
    const wasExtended = extendAction(event, allPlacedBids, bThreadMap, action);
    if(wasExtended) return;
    event.__setValue(action.payload);
    const askForBids = allPlacedBids.askForBid.get(action.eventId)!;
    askForBids.forEach(bid => {
        bThreadMap.get(bid.bThreadId)!.progressBid(bid);
    });
    progressWaitingBThreads(allPlacedBids, bThreadMap, action.eventId, action.payload);
}


export function advanceResolveAction(event: BEvent<unknown>, bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: ResolveAction): void {
    event.__removePending();
    const wasExtended = extendAction(event, allPlacedBids, bThreadMap, action);
    if(wasExtended) return;
    const requestedAction: RequestedAction = {
        id: action.id,
        bThreadId: action.bThreadId,
        eventId: action.eventId,
        type: "requestedAction",
        payload: action.payload
    };
    advanceRequestedAction(event, bThreadMap, allPlacedBids, requestedAction);
}


export function advanceResolveExtendAction(event: BEvent<unknown>, bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: ResolveExtendAction): void {
    event.__removePending();
    const wasExtended = extendAction(event, allPlacedBids, bThreadMap, action);
    if(wasExtended) return;
    if(action.extendedActionType === 'requestedAction' || action.extendedActionType === 'resolveAction') {
        const extendAction: RequestedAction = {
            id: action.id,
            type: 'requestedAction',
            bThreadId: action.bThreadId,
            eventId: action.eventId,
            payload: action.payload
        }
        advanceRequestedAction(event, bThreadMap, allPlacedBids, extendAction);
    }
    if(action.extendedActionType === 'triggeredAction') {
        const extendAction: TriggeredAction = {
            id: action.id,
            type: action.extendedActionType,
            bThreadId: action.bThreadId,
            eventId: action.eventId,
            payload: action.payload
        }
        advanceTriggeredAction(event, bThreadMap, allPlacedBids, extendAction);
    }
    if(action.extendedActionType === 'uiAction') {
        const extendAction: UIAction = {
            id: action.id,
            type: action.extendedActionType,
            bThreadId: action.bThreadId,
            eventId: action.eventId,
            payload: action.payload
        }
        advanceUiAction(event, bThreadMap, allPlacedBids, extendAction);
    }
}


export function advanceRejectAction(event: BEvent, bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: RejectAction): void {
    event.__removePending();
    const catchErrorBids = allPlacedBids.catchErrorBid.get(action.eventId);
    if(catchErrorBids) {
        catchErrorBids.forEach(bid => {
            bThreadMap.get(bid.bThreadId)?.progressBid(bid);
        });
        return;
    }
    else {
        bThreadMap.get(action.bThreadId)?.throwError(action.eventId, action.error);
    }

}
