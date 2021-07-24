import { BidType, getMatchingBids, PlacedBid } from './bid';
import { NameKeyId } from './name-key-map';
import { AnyAction, ResolveAction, ResolveExtendAction, UIAction, RequestedAction } from './action';
import { AllPlacedBids, unblockNameKeyId } from '.';
import { combinedIsValid, ReactionCheck } from './validation';
import { BThreadMap } from './update-loop';


export function getProgressingBids(allPlacedBids: AllPlacedBids, types: BidType[], eventId: NameKeyId, payload: unknown): PlacedBid[] | undefined {
    const matchingBids = getMatchingBids(allPlacedBids, types, eventId);
    if(matchingBids === undefined) return undefined;
    const progressingBids: PlacedBid[] = [];
    matchingBids.forEach(bid => {
        if(bid.payloadValidationCB === undefined) {
            progressingBids.push(bid);
            return undefined;
        }
        const result = bid.payloadValidationCB(payload);
        if(typeof result === 'object' && result.isValid || result === true) {
            progressingBids.push(bid);
        }
    });
    return progressingBids.length === 0 ? undefined : progressingBids;
}


function progressWaitingBThreads(allPlacedBids: AllPlacedBids, bThreadMap: BThreadMap, types: BidType[], action: AnyAction): void {
    const bids = getProgressingBids(allPlacedBids, types, action.eventId, action.payload);
    if(bids === undefined) return;
    bids.forEach(bid => {
        bThreadMap.get(bid.bThreadId)?.progressWait(bid, action.eventId);
    });
    return;
}


function extendAction(allPlacedBids: AllPlacedBids, bThreadMap: BThreadMap, extendedAction: AnyAction): boolean {
    const matchingExtendBids = getMatchingBids(allPlacedBids, ["extendBid"], extendedAction.eventId);
    if(matchingExtendBids === undefined) return false;
    while(matchingExtendBids && matchingExtendBids.length > 0) {
        const extendBid = matchingExtendBids.pop()!; // get bid with highest priority
        if(allPlacedBids.get(extendBid.eventId)?.blockedBy) continue;
        const bidContext = allPlacedBids.get!(extendBid.eventId)!;
        bidContext!.pendingBy = undefined;
        if(combinedIsValid(extendBid, bidContext, extendedAction.payload) !== true) continue
        const extendingBThread = bThreadMap.get(extendBid.bThreadId);
        if(extendingBThread === undefined) continue;
        const extendContext = extendingBThread.progressExtend(extendedAction);
        if(!extendContext) continue;
        if(extendContext.promise) {
            progressWaitingBThreads(allPlacedBids, bThreadMap, ["onPendingBid"], extendedAction);
            return true;
        } else {
            extendedAction.payload = extendContext.value;
        }
    }
    return false;
}


export function advanceRequestedAction(bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: RequestedAction): ReactionCheck {
    const requestingBThread = bThreadMap.get(action.bThreadId);
    if(requestingBThread === undefined) return ReactionCheck.RequestingBThreadNotFound;
    if(action.resolveActionId === 'pending') {
        requestingBThread.addPendingRequest(action);
        progressWaitingBThreads(allPlacedBids, bThreadMap, ["onPendingBid"], action);
        return ReactionCheck.OK;
    }
    const extendContext = extendAction(allPlacedBids, bThreadMap, action);
    if(extendContext) return ReactionCheck.OK;
    const checkedProgress = requestingBThread.progressRequested(action.bidType, action.eventId, action.payload);
    if(checkedProgress !== ReactionCheck.OK) return checkedProgress;
    progressWaitingBThreads(allPlacedBids, bThreadMap, ["askForBid", "waitForBid"], action);
    return ReactionCheck.OK;
}


export function advanceUiAction(bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: UIAction): ReactionCheck {
    if(extendAction(allPlacedBids, bThreadMap, action)) return ReactionCheck.OK;
    progressWaitingBThreads(allPlacedBids, bThreadMap, ["askForBid", "waitForBid"], action);
    return ReactionCheck.OK;
}


export function advanceResolveExtendAction(bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: ResolveExtendAction): ReactionCheck {
    const extendingBThread = bThreadMap.get(action.extendingNameKeyId);
    if(!extendingBThread) return ReactionCheck.ExtendingBThreadNotFound;
    const resolveCheck = extendingBThread.deleteResolvedExtend(action);
    if(resolveCheck !== ReactionCheck.OK) return resolveCheck;
    if(action.extendedRequestingBid) {
        const requestingBThread = bThreadMap.get(action.extendedRequestingBid.bThreadId);
        if(requestingBThread === undefined) return ReactionCheck.ExtendedRequestingBThreadNotFound;
        requestingBThread.progressRequested(action.extendedRequestingBid.type, action.eventId, action.payload);
    }
    unblockNameKeyId(allPlacedBids, action.eventId);
    progressWaitingBThreads(allPlacedBids, bThreadMap, ['askForBid', 'waitForBid'], action);
    return ReactionCheck.OK;
}


export function advanceResolveAction(bThreadMap: BThreadMap, allPlacedBids: AllPlacedBids, action: ResolveAction): ReactionCheck {
    const requestingBThread = bThreadMap.get(action.resolvedRequestingBid.bThreadId);
    if(requestingBThread === undefined) return ReactionCheck.RequestingBThreadNotFound;
    unblockNameKeyId(allPlacedBids, action.eventId);
    if(extendAction(allPlacedBids, bThreadMap, action)) return ReactionCheck.OK;
    const resolveCheck = requestingBThread.progressResolved(action.eventId, action.payload);
    if(resolveCheck !== ReactionCheck.OK) return resolveCheck;
    progressWaitingBThreads(allPlacedBids, bThreadMap, ['askForBid', 'waitForBid'], action);
    return ReactionCheck.OK;
}

export function advanceRejectAction(bThreadMap: BThreadMap, action: ResolveAction): ReactionCheck {
    const requestingBThread = bThreadMap.get(action.resolvedRequestingBid.bThreadId);
    if(requestingBThread === undefined) return ReactionCheck.RequestingBThreadNotFound;
    return requestingBThread.rejectPending(action.eventId, action.payload);
}
