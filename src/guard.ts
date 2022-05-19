import { ResolveAction } from './action';
import { EventCore } from './event-core';
import { NameKeyId } from './name-key-map';
import { ExtendBid, PlacedBid, PlacedRequestBid, PlacedTriggerBid } from './bid';
import { isThenable, notEmpty } from './utils';


export type GuardResult<V> = boolean | (V | null)[] | { failed?: (V | null)[], passed?: (V | null)[] }
export type GuardCB<P, V> = (value: P) => GuardResult<V>;


export interface ExplainEventResult<V> {
    isValid: boolean;
    failed: V[];
    passed: V[];
    invalidReason: 'None' | 'NotConnected' | 'Pending' | 'Extended' | 'NoAskForBid' | 'Guard' | "Blocked";
    askForBid?: {flowId: NameKeyId, bidId: number};
    nextValue: any;
}


function getGuards<P, V>(bids?: PlacedBid<P,V>[]): GuardCB<P, V>[] | undefined {
    if(bids === undefined) return undefined;
    const guards = bids.map(bid => bid.guard).filter(notEmpty);
    if(guards.length === 0) return undefined;
    return guards;
}


export function isValidReturn(result: GuardResult<any>): boolean {
    if(typeof result === 'boolean') {
        return result;
    }
    if(Array.isArray(result)) {
        return result.filter(notEmpty).length === 0;
    }
    return !result.failed?.filter(notEmpty).length;
}


export function getHighestPriorityAskForBid<P, V>(event: EventCore<P, V>): PlacedBid<P,V> | undefined {
    return event.getBids('askForBid')?.[0];
}


function addGuardResult<V>(result: ExplainEventResult<V>, guardResult?: GuardResult<V>): ExplainEventResult<V>  {
    if(guardResult === undefined || guardResult === true) return result;
    if(guardResult === false) {
        result.invalidReason = 'Guard';
        result.isValid = false;
        return result;
    }
    if(Array.isArray(guardResult)) {
        const notEmptyGuardResult = guardResult.filter(notEmpty);
        if(notEmptyGuardResult.length === 0) return result;
        result.invalidReason = 'Guard';
        result.isValid = false;
        result.failed = [...result.failed, ...notEmptyGuardResult];
        return result;
    }
    const notEmptyFailed = guardResult.failed?.filter(notEmpty);
    if(notEmptyFailed?.length){
        result.invalidReason = 'Guard';
        result.isValid = false;
        result.failed = [...result.failed, ...notEmptyFailed];
    }
    const notEmptyPassed = guardResult.passed?.filter(notEmpty);
    if(notEmptyPassed?.length) {
        result.passed = [...result.passed, ...notEmptyPassed];
    }
    return result;
}


export function getInitialExplainResult<P, V>(event: EventCore<P, V> | undefined, ignore?: 'pending' | 'extend'): ExplainEventResult<V> {
    const result: ExplainEventResult<V> = {
        isValid: true,
        failed: [],
        passed: [],
        invalidReason: 'None',
        askForBid: undefined,
        nextValue: undefined
    }
    if(event?.isConnected !== true){
        result.isValid = false;
        result.invalidReason = 'NotConnected';
        return result;
    }
    if(event.isBlocked && ignore !== 'pending') {
        result.isValid = false;
        result.invalidReason = 'Blocked';
        return result;
    }
    if(event.pendingBy && ignore !== 'pending') {
        result.isValid = false;
        result.invalidReason = 'Pending'
    }
    if(event.extendedBy && ignore !== 'extend' && ignore !== 'pending') {
        result.isValid = false;
        result.invalidReason = 'Extended'
    }
    return result;
}


export function explainAskFor<P, V>(event: EventCore<P,V>, nextValue: P): ExplainEventResult<V> {
    let result = getInitialExplainResult(event);
    if(!result.isValid) return result;
    const askForBid = getHighestPriorityAskForBid(event);
    if(askForBid === undefined) {
        result.isValid = false;
        result.invalidReason = 'NoAskForBid';
        return result;
    }
    result.askForBid = {flowId: askForBid.flowId, bidId: askForBid.id};
    addGuardResult(result, askForBid.guard?.(nextValue));
    const validateGuards = getGuards(event.getBids('validateBid'));
    validateGuards?.forEach(guard => {
        result = addGuardResult(result, guard(nextValue));
    });
    return result;
}


export function explainTrigger<P, V>(event: EventCore<P,V> | undefined, triggerBid: PlacedTriggerBid<P,V>): ExplainEventResult<V> {
    let result = getInitialExplainResult(event);
    if(!result.isValid) return result;
    const askForBid = getHighestPriorityAskForBid(event!);
    if(askForBid === undefined) {
        result.isValid = false;
        result.invalidReason = 'NoAskForBid';
        return result;
    }
    result.askForBid = {flowId: askForBid.flowId, bidId: askForBid.id};
    const nextValue = result.nextValue = (triggerBid.payload instanceof Function) ? triggerBid.payload() : triggerBid.payload;
    result = addGuardResult(result, triggerBid.guard?.());
    result = addGuardResult(result, askForBid.guard?.(nextValue));
    const validateGuards = getGuards(event!.getBids('validateBid'));
    validateGuards?.forEach(guard => {
        result = addGuardResult(result, guard(nextValue));
    });
    return result;
}


export function explainRequest<P, V>(event: EventCore<P,V> | undefined, requestBid: PlacedRequestBid<P,V>): ExplainEventResult<V> {
    let result = getInitialExplainResult(event);
    if(!result.isValid) return result;
    result = addGuardResult(result, requestBid.guard?.());
    if(!result.isValid) return result;
    const nextValue = result.nextValue = (requestBid.payload instanceof Function) ? requestBid.payload() : requestBid.payload;
    if(!isThenable(nextValue)) {
        const v = nextValue as P;
        const validateGuards = getGuards(event!.getBids('validateBid'));
        validateGuards?.forEach(guard => {
            result = addGuardResult(result, guard(v));
        });    }
    return result;
}


export function explainResolve<P, V>(event: EventCore<P,V> | undefined, resolveAction: ResolveAction): ExplainEventResult<V> {
    let result = getInitialExplainResult(event, 'pending');
    if(!result.isValid) return result;
    const validateGuards = getGuards(event!.getBids('validateBid'));
    validateGuards?.forEach(guard => {
        result = addGuardResult(result, guard(resolveAction.payload));
    });
    return result;
}


export function explainExtend<P, V>(event: EventCore<P,V>, extendBid: ExtendBid<P,V>, nextValue: P): ExplainEventResult<V> {
    let result = getInitialExplainResult(event, 'extend');
    if(!result.isValid) return result;
    if(!isThenable(nextValue)) {
        result = addGuardResult(result, extendBid.guard?.(nextValue));
        const validateGuards = getGuards(event.getBids('validateBid'));
        validateGuards?.forEach(guard => {
            result = addGuardResult(result, guard(nextValue));
        });
    }
    return result;
}