import { PlacedBid } from './bid';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { AnyAction } from './action';
import { AllPlacedBids, BidType, OnFinishLoopCB, RequestSelectReason } from '.';

export interface LoopLog {
    placedBids: AllPlacedBids;
    reasons?: RequestSelectReason[];
    action: AnyAction;
    reactions: NameKeyMap<BidType>;
}

function getInitialLoopLog(): Partial<LoopLog> {
    return {
        reactions: new NameKeyMap()
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
        this._loopLog!.placedBids = bids;
    }

    // 2. log involved scenarios
    // For a requested action, what scenarios have selected the specific action?
    public logReasonsForSelectedRequestBid(reasons: RequestSelectReason[]): void {
        this._loopLog.reasons = reasons;
    }

    // 3. log action
    public logAction(action: AnyAction): void {
        const a = {...action};
        if(action.type === "requestedAsyncAction") {
            delete a.payload; // do not log the promise object
        }
        if(a.type === "uiAction") {
            delete a.dispatchResultCB;
        }
        this._loopLog.action = a;
    }

    // 4. log reactions ( by Flow )
    public logReaction(flowId: NameKeyId, bid: PlacedBid): void {
        this._allRelevantScenarios!.set(flowId);
        this._loopLog.reactions!.set(flowId, bid.type);
    }

    // 5. loop finished
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
