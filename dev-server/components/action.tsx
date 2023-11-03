import { Action } from "../../core/index.ts";

/**
 * shows all properties of an action, also if it was canceled or not
 * @param action - the action to show
 */
export function Action({ action, isCancelled }: { action: Action<any>, isCancelled: boolean }) {
    return (
        <div>
            <div>{action.id}</div>
            <div>{action.eventId}</div>
            <div>{action.type}</div>
        </div>
    );
}