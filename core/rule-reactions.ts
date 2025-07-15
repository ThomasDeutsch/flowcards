import { Action, ExtendableAction, InputAction, RequestedAction, RequestedAsyncAction, ResolvePendingRequestAction } from "./action.ts";
import { isValidReturn, validateBid } from "./payload-validation.ts";
import { WhenBid, BidType, CurrentBidsForEvent, Placed, ProgressingBid, SetBid } from "./bid.ts";
import { Event } from "./event.ts";
import { Rule } from "./rule.ts";
import { ExtendInformation } from "./rule.ts";


// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

export type RuleReaction = {rulePath: string[], type: RuleReactionType, details: RuleReactionDetails};

export type RuleReactionType =
    'rule enabled' |
    'rule progressed on a bid' |
    'rule progressed on a handled error' |
    'pending extend added' |
    'pending extend resolved' |
    'pending extend cancelled' |
    'pending extend aborted' |
    'pending request added' |
    'pending request resolved' |
    'pending request cancelled' |
    'pending request rejected' |
    'rule disabled' |
    'rule ended' |
    'rule enabled, after being disabled' |
    'rule ended because an error on the first bid was not handled' |
    'rule restarted manually by calling rule.restart' |
    'rule restarted because an error was not handled' |
    'rule restarted because the value of a given event changed' |
    'an active given was added' |
    'bid placed' |
    'bid validation failed'


export interface RuleReactionDetails {
    eventId?: string;
    bidId?: number;
    bidType?: string;
    actionId?: number;
    childRuleId?: string;
    value?: unknown;
}

// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------


export function progressGivenBids<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action:  InputAction<P> & {id: number} | RequestedAction<P> | ResolvePendingRequestAction<P> & {id: number}, eventValueHasChanged: boolean): void {
    eventInfo[BidType.given]?.forEach((givenBid) => {
        if(givenBid.isActive && eventValueHasChanged) {
            givenBid.rule.__restart(true);
        }
        else if(isValidReturn(validateBid<P, V>(givenBid, action.payload))) {
            givenBid.rule.__addActiveGivenBid(givenBid);
            givenBid.rule.__onEvent(givenBid.event, givenBid, action.id);
        }
    });
}

export function reactToInputAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: InputAction<P> & {id: number}, whenBid: Placed<WhenBid<P, V>>): void {
    eventInfo.pendingExtend?.extendingRule?.__resolveExtend(eventInfo.event);
    if(progressExtendBid(eventInfo, action, whenBid)) return;
    const eventValueHasChanged = eventInfo.event.__setValue(action.payload);
    whenBid?.rule.__onEvent(eventInfo.event, whenBid, action.id);
    progressExtendedBids(eventInfo, action);
    progressGivenBids(eventInfo, action, eventValueHasChanged);
}

export function reactToRequestedAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: RequestedAction<P>  & {id: number}, requestBid: Placed<SetBid<P, V>>, whenBid?: Placed<WhenBid<P, V>>): void {
    eventInfo.pendingExtend?.extendingRule?.abortExtend(eventInfo.event);
    if(progressExtendBid(eventInfo, action, requestBid)) return;
    const eventValueHasChanged = eventInfo.event.__setValue(action.payload);
    progressExtendedBids(eventInfo, action);
    requestBid.rule.__onEvent(requestBid.event, requestBid, action.id);
    whenBid?.rule.__onEvent(eventInfo.event, whenBid, action.id);
    progressGivenBids(eventInfo, action, eventValueHasChanged);
}

export function reactToRequestedAsyncAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: RequestedAsyncAction<P>, requestBid: Placed<SetBid<P, V>>): void {
    const extendingRule = progressExtendBid(eventInfo, action, requestBid)
    if(extendingRule) {
        // if the pending request gets extended, the extending rule will receive the pending event info. In this case, the extending rule is able to cancel the event if needed.
        extendingRule.__onRequestedAsync({...requestBid, rule: extendingRule}, action.payload, action.id);
    }
    else {
        requestBid.rule.__onRequestedAsync(requestBid, action.payload, action.id);
    }
}

export function reactToResolveAsyncAction<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: ResolvePendingRequestAction<P> & {id: number}, pendingRequest: Placed<SetBid<P,V>>): void {
    pendingRequest.rule.__resolvePendingRequest(eventInfo.event);
    eventInfo.pendingExtend?.extendingRule?.__resolveExtend(eventInfo.event);
    if(progressExtendBid(eventInfo, action, pendingRequest)) return;
    const eventValueHasChanged = eventInfo.event.__setValue(action.payload);
    progressExtendedBids(eventInfo, action);
    eventInfo.pendingRequest = undefined;
    pendingRequest.rule.__onEvent(eventInfo.event, pendingRequest ,action.id);
    progressGivenBids(eventInfo, action, eventValueHasChanged);
}

export function reactToRejectAction(rule: Rule, event: Event<any, any>): void {
    rule.__onRejectAsyncAction(event);
}


// HELPERS ------------------------------------------------------------------------------------------------------------

 function progressExtendBid<P, V>(eventInfo: CurrentBidsForEvent<P, V>, action: ExtendableAction<P> & {id: number}, extendedBid: Placed<ProgressingBid<P,V>>): Rule | undefined {
    if(!eventInfo.extend?.length) return undefined;
    const bid = eventInfo.extend.find((extend) => isValidReturn(validateBid<P, V>(extend, action.payload as P)));
    if(bid === undefined) return undefined;
    const extendInformation: ExtendInformation<P,V> = {
        value: action.payload,
        event: eventInfo.event,
        extendedBids: eventInfo.pendingExtend ? [extendedBid, ...eventInfo.pendingExtend.extendedBids] : [extendedBid],
    }
    // set the pending extend directly to the event info, so that the extended event will get all the information it needs as soon as the __onExtend is called and the rule progresses.
    eventInfo.pendingExtend = extendInformation;
    const extendingRule = bid.rule.rule(`extending_${bid.event.id}_${bid.id}`, bid.extendingRule, false, extendInformation);
    return extendingRule;
}

function progressExtendedBids(eventInfo: CurrentBidsForEvent<any, any>, action: Action<any> & {id: number}): void {
    if(eventInfo.pendingExtend) {
        const extendedBids = [...eventInfo.pendingExtend.extendedBids];
        eventInfo.pendingExtend = undefined;
        extendedBids.forEach((extendedBid) => {
            extendedBid?.rule.__onEvent(eventInfo.event, extendedBid, action.id);
        });
    }
}