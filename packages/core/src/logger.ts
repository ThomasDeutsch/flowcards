import { Action } from './action';

export class Logger {
    public actions: Action[] = [];

    // log action
    public logAction(action: Action): void {
        this.actions.push({...action});
        if(action.resolve) {
            this.actions[action.resolve.requestedActionIndex].resolveActionIndex = action.index!;
        }
    }

    public resetLog(): void {
        this.actions = [];
    }
}
