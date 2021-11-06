import { BidType, PlacedBid } from './bid';
import { NameKeyId } from './name-key-map';
import { AnyAction, ResolveAction, ResolveExtendAction, UIAction, RequestedAction } from './action';
import { AllPlacedBids, getMatchingBids, unblockNameKeyId } from '.';
import { getAllPayloadValidationCallbacks, isValidPayload, isValidReturn } from './validation';
import { BThreadMap } from './update-loop';
import { ReactionCheck } from './reaction';


export function getProgressingBids(allPlacedBids: AllPlacedBids, type: BidType, eventId: NameKeyId, payload: unknown): PlacedBid[] | undefined {
    const matchingBids = getMatchingBids(allPlacedBids, type, eventId);
    if(matchingBids === undefined) return undefined;
    const progressingBids: PlacedBid[] = [];
    matchingBids.forEach(bid => {
        if(bid.payloadValidationCB === undefined) {
            progressingBids.push(bid);
            return;
        }
        const validationResult = bid.payloadValidationCB(payload);
        if(isValidReturn(validationResult)) {
            progressingBids.push(bid);
        }
    });
    return progressingBids.length === 0 ? undefined : progressingBids;
}


function progressWaitingBThreads(allPlacedBids: AllPlacedBids, bThreadMap: BThreadMap, type: BidType, action: AnyAction): void {
    const bids = getProgressingBids(allPlacedBids, type, action.eventId, action.payload);
    if(bids === undefined) return;
    bids.forEach(bid => {
        bThreadMap.get(bid.bThreadId)?.progressWait(bid, action.eventId);
    });
    return;
}


function extendAction(allPlacedBids: AllPlacedBids, bThreadMap: BThreadMap, extendedAction: AnyAction): boolean {
    const matchingExtendBids = getMatchingBids(allPlacedBids, "extendBid", extendedAction.eventId);
    if(matchingExtendBids === undefined) return false;
    const validationBids = allPlacedBids.validateBids.get(extendedAction.eventId);
    while(matchingExtendBids && matchingExtendBids.length > 0) {
        const extendBid = matchingExtendBids.shift()!; // get bid with highest priority
        const validationCallbacks = getAllPayloadValidationCallbacks(extendBid, validationBids);
        if(isValidPayload(validationCallbacks, extendedAction.payload) !== true) continue
        const extendingBThread = bThreadMap.get(extendBid.bThreadId);
        if(extendingBThread === undefined) continue;
        allPlacedBids.pending.set(extendBid.eventId, extendingBThread.id);
        const extendContext = extendingBThread.progressExtend(extendedAction);
        if(!extendContext) continue;
        progressWaitingBThreads(allPlacedBids, bThreadMap, "onPendingBid", extendedAction);
        return true;
    }
    return false;
}


export function advanceRequestedAction(bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: RequestedAction): ReactionCheck {
    const requestingBThread = bThreadMap.get(action.bThreadId);
    if(requestingBThread === undefined) return ReactionCheck.RequestingBThreadNotFound;
    if(action.resolveActionId === 'pending') {
        requestingBThread.addPendingRequest(action);
        progressWaitingBThreads(allPlacedBids, bThreadMap, "onPendingBid", action);
        return ReactionCheck.OK;
    }
    const extendContext = extendAction(allPlacedBids, bThreadMap, action);
    if(extendContext) return ReactionCheck.OK;
    const checkedProgress = requestingBThread.progressBid(action.bidType, action.eventId, action.payload);
    if(checkedProgress !== ReactionCheck.OK) return checkedProgress;
    if(action.matchedAskForBThreadId) {
        const askForBThread = bThreadMap.get(action.matchedAskForBThreadId);
        askForBThread?.progressBid('askForBid', action.eventId, action.payload);
    }
    progressWaitingBThreads(allPlacedBids, bThreadMap, "waitForBid", action);
    return ReactionCheck.OK;
}


export function advanceUiAction(bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: UIAction): ReactionCheck {
    if(extendAction(allPlacedBids, bThreadMap, action)) return ReactionCheck.OK;
    const askingBThread = bThreadMap.get(action.bThreadId);
    if(askingBThread === undefined) return ReactionCheck.AskingBThreadNotFound;
    askingBThread.progressBid('askForBid', action.eventId, action.payload);
    progressWaitingBThreads(allPlacedBids, bThreadMap, "waitForBid", action);
    return ReactionCheck.OK;
}


export function advanceResolveExtendAction(bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: ResolveExtendAction): ReactionCheck {
    const extendingBThread = bThreadMap.get(action.bThreadId);
    if(!extendingBThread) return ReactionCheck.ExtendingBThreadNotFound;
    const resolveCheck = extendingBThread.deleteResolvedExtend(action);
    if(resolveCheck !== ReactionCheck.OK) return resolveCheck;
    unblockNameKeyId(allPlacedBids, action.eventId);
    if(extendAction(allPlacedBids, bThreadMap, action)) return ReactionCheck.OK;
    if(action.extendedBThreadId) {
        const requestingBThread = bThreadMap.get(action.extendedBThreadId);
        if(requestingBThread === undefined) return ReactionCheck.ExtendedRequestingBThreadNotFound;
        requestingBThread.progressBid(action.extendedBidType!, action.eventId, action.payload);
    }
    progressWaitingBThreads(allPlacedBids, bThreadMap, 'waitForBid', action);
    return ReactionCheck.OK;
}


export function advanceResolveAction(bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: ResolveAction): ReactionCheck {
    const requestingBThread = bThreadMap.get(action.bThreadId);
    if(requestingBThread === undefined) return ReactionCheck.RequestingBThreadNotFound;
    unblockNameKeyId(allPlacedBids, action.eventId);
    if(extendAction(allPlacedBids, bThreadMap, action)) return ReactionCheck.OK;
    const resolveCheck = requestingBThread.progressResolved(action.eventId, action.payload);
    if(resolveCheck !== ReactionCheck.OK) return resolveCheck;
    progressWaitingBThreads(allPlacedBids, bThreadMap, 'waitForBid', action);
    return ReactionCheck.OK;
}

export function advanceRejectAction(bThreadMap: BThreadMap, action: ResolveAction): ReactionCheck {
    const requestingBThread = bThreadMap.get(action.bThreadId);
    if(requestingBThread === undefined) return ReactionCheck.RequestingBThreadNotFound;
    return requestingBThread.rejectPending(action.eventId, action.payload);
}
