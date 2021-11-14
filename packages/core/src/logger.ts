import { PlacedBid } from './bid';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { AnyActionWithId } from './action';
import { AllPlacedBids, OnFinishLoopCB } from '.';


export enum BThreadReactionType {
    progress = 'progress',
    error = 'error',
    newPending = 'newPending',
    resolvedExtend = 'resolvedExtend'
}

export interface BThreadReaction {
    reactionType: BThreadReactionType;
    placedBid?: PlacedBid;
}

export interface LoopLog {
    actionScenarios: NameKeyMap<void>;
    action: AnyActionWithId;
    reactions: NameKeyMap<BThreadReaction>;
    placedBids: AllPlacedBids;
    allRelevantScenarios: NameKeyMap<void>;
}

function getInitialLoopLog(): Partial<LoopLog> {
    return {
        actionScenarios: new NameKeyMap(),
        reactions: new NameKeyMap()    }
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
    public logInvolvedScenariosForNextRequestBid(scenarioIds: NameKeyId[]): void {
        scenarioIds.forEach(id => {
            this._loopLog.actionScenarios!.set(id);
            this._allRelevantScenarios!.set(id)
        })
    }

    // 3. log action
    public logAction(action: AnyActionWithId): void {
        const a = {...action};
        if(action.type === "requestedAction" && action.resolveActionId === 'pending') {
            delete a.payload; // do not log the promise object
        }
        if(a.type === "uiAction") {
            delete a.dispatchResultCB;
        }
        this._loopLog.action = a;
    }

    // 4. log reactions ( by BThread )
    public logReaction(reactionType: BThreadReactionType, bThreadId: NameKeyId, bid?: PlacedBid): void {
        this._allRelevantScenarios!.set(bThreadId);
        this._loopLog.reactions!.set(bThreadId, {
            reactionType: reactionType,
            placedBid: bid
        });
    }

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
