import { PlacedBid } from './bid';
import { NameKeyId } from './name-key-map';
import { AnyActionWithId } from './action';
import { AllPlacedBids, OnFinishLoopCB } from '.';


export enum BThreadReactionType {
    progress = 'progress',
    error = 'error',
    newPending = 'newPending',
    resolvedExtend = 'resolvedExtend' //TODO: needed? can this be replaced with 'progress' ?
}

export interface BThreadReaction {
    reactionType: BThreadReactionType;
    placedBid?: PlacedBid;
}

export interface LoopLog {
    scenarioIds: NameKeyId[];
    action: AnyActionWithId;
    reactions: BThreadReaction[];
    placedBids: AllPlacedBids;
}

export class Logger {
    private _loopLogs: LoopLog[] = [];
    private _loopLog: Partial<LoopLog> = {
        scenarioIds: [],
        reactions: []
    }
    private readonly _onFinishLoopCB?: OnFinishLoopCB

    constructor(onFinishLoopCB?: OnFinishLoopCB) {
        this._onFinishLoopCB = onFinishLoopCB;
    }

    // 1. log involved scenarios
    // For a requested action, what scenarios have selected the specific action?
    public logInvolvedScenariosForNextRequestBid(scenarioIds: NameKeyId[]): void {
        this._loopLog.scenarioIds = [...this._loopLog.scenarioIds!, ...scenarioIds];
    }

    // 2. log placed bids
    public logPlacedBids(bids: AllPlacedBids): void {
        this._loopLog!.placedBids = bids;
    }

    // 3. log action
    public logAction(action: AnyActionWithId): void {
        const a = {...action};
        if(action.type === "requestedAction" && action.resolveActionId === 'pending') {
            delete a.payload; // do not save the promise object
        }
        this._loopLog.action = a;
    }

    // 4. log reactions ( by BThread )
    public logReaction(reactionType: BThreadReactionType, bThreadId: NameKeyId, bid?: PlacedBid): void {
        this._loopLog.scenarioIds?.push(bThreadId);
        this._loopLog.reactions!.push({
            reactionType: reactionType,
            placedBid: bid
        });
    }

    public finishLoop(): void {
        this._loopLogs.push({...this._loopLog} as LoopLog);
        this._onFinishLoopCB?.({...this._loopLog} as LoopLog);
        this._loopLog = {
            scenarioIds: [],
            reactions: []
        };
    }

    public getLoopLogs(): LoopLog[] {
        const logs = [...this._loopLogs];
        this._loopLogs = [];
        return logs;
    }

    public resetLog(): void {
        this._loopLogs = [];
        this._loopLog = {
            scenarioIds: [],
            reactions: []
        }
    }
}
