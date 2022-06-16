import { BidType, PlacedBid } from './bid';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { AnyAction } from './action';
import { OnFinishLoopCB } from './index';
import { ExplainEventResult } from './guard';

export interface ActionReactionLog {
    explain: ExplainEventResult<any>[];
    action?: AnyAction;
    reactions: NameKeyMap<BidType>;
    canceled: {flowId: NameKeyId, eventId: NameKeyId, type: 'extend' | 'request', reason?: 'flow disabled' | 'flow reset' | NameKeyId }[];
}

function getInitialLoopLog(): ActionReactionLog {
    return {
        reactions: new NameKeyMap(),
        canceled: [],
        explain: []
    }
}

export class Logger {
    private _logs: ActionReactionLog[] = [];
    private _allRelevantFlows = new NameKeyMap<void>();
    private _log: ActionReactionLog = getInitialLoopLog();
    private readonly _onFinishLoopCB?: OnFinishLoopCB;

    public get allRelevantFlows(): NameKeyMap<void> {
        return this._allRelevantFlows;
    }

    constructor(onFinishLoopCB?: OnFinishLoopCB) {
        this._onFinishLoopCB = onFinishLoopCB;
    }

    // 2. log involved scenarios
    // For a requested action, what scenarios have selected the specific action?
    public logExplain(explain: ExplainEventResult<any>): void {
        if(explain.isValid) return; // do not log explains that passed
        this._log.explain = [...this._log.explain, explain];
    }

    // 3. log action
    public logAction(action: AnyAction): void {
        const a = {...action};
        if(action.type === "requestedAsyncAction") {
            delete a.payload; // do not log the promise object
        }
        this._log.action = a;
    }

    // 0. log canceled pending Extends or Requets if Flow is destroyed on disable
    // 4. log canceled pending events
    public logCanceledPending(flowId: NameKeyId, eventId: NameKeyId, type: 'extend' | 'request', reason?: 'flow disabled' | 'flow reset' | NameKeyId): void {
        this._log.canceled!.push({flowId, eventId, type, reason});
    }

    // 5. log reactions ( by Flow )
    public logReaction(flowId: NameKeyId, bid: PlacedBid): void {
        this._allRelevantFlows!.set(flowId);
        this._log.reactions!.set(flowId, bid.type);
    }
    public logErrorReaction(flowId: NameKeyId, eventId: NameKeyId, error: any): void {
        //TODO: persist in logs
        const x = 1;
    }

    // 6. loop finished
    public finishLoop(): void {
        if(this._log.action) {
            this._logs.push({...this._log});
        }
        this._onFinishLoopCB?.({...this._log});
        this._log = getInitialLoopLog();
    }

    public getLoopLogs(): ActionReactionLog[] {
        const logs = [...this._logs];
        this._logs = [];
        return logs;
    }

    public resetLog(): void {
        this._logs = [];
        this._allRelevantFlows = new NameKeyMap();
        this._log = getInitialLoopLog();
    }
}
