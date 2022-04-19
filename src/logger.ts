import { AllPlacedBids, BidType, PlacedBid } from './bid';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { AnyAction } from './action';
import { OnFinishLoopCB } from 'index';
import { ExplainEventResult } from 'guard';

export interface LoopLog {
    placedBids: AllPlacedBids;
    explain: ExplainEventResult<any>[];
    action: AnyAction;
    reactions: NameKeyMap<BidType>;
    droppedActions: NameKeyId[];
    canceled: {flowId: NameKeyId, eventId: NameKeyId, type: 'extend' | 'request', reason?: 'flow disabled' | 'flow reset' | NameKeyId }[];
}

function getInitialLoopLog(): Partial<LoopLog> {
    return {
        reactions: new NameKeyMap(),
        canceled: [],
        droppedActions: [],
        explain: []
    }
}

export class Logger {
    private _loopLogs: LoopLog[] = [];
    private _allRelevantScenarios = new NameKeyMap<void>();
    private _loopLog: Partial<LoopLog> = getInitialLoopLog();
    private readonly _onFinishLoopCB?: OnFinishLoopCB;

    public get allRelevantScenarios(): NameKeyMap<void> {
        return this._allRelevantScenarios;
    }

    constructor(onFinishLoopCB?: OnFinishLoopCB) {
        this._onFinishLoopCB = onFinishLoopCB;
    }

    // 1. log placed bids
    public logPlacedBids(bids: AllPlacedBids): void {
        this._loopLog.placedBids = bids;
    }

    // 2. log involved scenarios
    // For a requested action, what scenarios have selected the specific action?
    public logExplain(explain: ExplainEventResult<any>): void {
        this._loopLog.explain = [...this._loopLog.explain!, explain];
    }

    // 2.9 log dropped action
    public logDroppedAction(action: AnyAction): void {
        this._loopLog.droppedActions!.push(action.eventId);
    }

    // 3. log action
    public logAction(action: AnyAction): void {
        const a = {...action};
        if(action.type === "requestedAsyncAction") {
            delete a.payload; // do not log the promise object
        }
        this._loopLog.action = a;
    }

    // 0. log canceled pending Extends or Requets if Flow is destroyed on disable
    // 4. log canceled pending events
    public logCanceledPending(flowId: NameKeyId, eventId: NameKeyId, type: 'extend' | 'request', reason?: 'flow disabled' | 'flow reset' | NameKeyId): void {
        this._loopLog.canceled!.push({flowId, eventId, type, reason});
    }

    // 5. log reactions ( by Flow )
    public logReaction(flowId: NameKeyId, bid: PlacedBid): void {
        this._allRelevantScenarios!.set(flowId);
        this._loopLog.reactions!.set(flowId, bid.type);
    }
    public logErrorReaction(flowId: NameKeyId, eventId: NameKeyId, error: any): void {
        //TODO: persist in logs
        const x = 1;
    }

    // 6. loop finished
    public finishLoop(): void {
        this._loopLogs.push({...this._loopLog} as LoopLog);
        this._onFinishLoopCB?.({...this._loopLog} as LoopLog);
        this._loopLog = getInitialLoopLog();
    }

    public getLoopLogs(): LoopLog[] {
        const logs = [...this._loopLogs];
        this._loopLogs = [];
        return logs;
    }

    public resetLog(): void {
        this._loopLogs = [];
        this._allRelevantScenarios = new NameKeyMap();
        this._loopLog = getInitialLoopLog();
    }
}
