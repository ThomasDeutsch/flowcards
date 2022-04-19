import { QueueAction } from "action";
import { EventCore, EventCoreKeyed } from "event-core";
import { explainAskFor, ExplainEventResult } from "guard";
import { getHighestPriorityAskForBid } from "index";
import { NameKeyId } from "name-key-map";

export class UserEvent<P = void, V = string> extends EventCore<P, V> {
    constructor(nameOrNameKey: string | NameKeyId, initialValue?: P) {
        super(nameOrNameKey, 'UI', initialValue);
    }

    private _maybeAddToQueue(action: QueueAction): void {
        if(this._addToQueue === undefined ) {
            throw new Error('event not connected');
        }
        this._addToQueue(action);
    }

    public dispatch(value: P): Promise<ExplainEventResult<V>> {
        const explain = explainAskFor<P, V>(this, value);
        if(explain.isValid) {
            return new Promise<ExplainEventResult<V>>((resolve) => {
                this._maybeAddToQueue!({
                    type: "uiAction",
                    eventId: this.id,
                    payload: value,
                    id: -1,
                    bidId: explain.askForBid!.bidId,
                    flowId: explain.askForBid!.flowId
                });
                this._openResolves.add(resolve);
            });
        }
        return Promise.resolve(explain);
    }

    public explain(value: P): ExplainEventResult<V> {
        return explainAskFor<P, V>(this, value);
    }

    public isValid(value: P): boolean {
        // TODO: cache explain(value) call
        return this.explain(value).isValid === true;
    }

    public get isAskedFor(): boolean {
        return getHighestPriorityAskForBid(this) !== undefined;
    }
}


export class UserEventKeyed<P = void, V = string> extends EventCoreKeyed<UserEvent<P,V>, P> {
    constructor(nameOrNameKey: string, initialValue?: P) {
        super(nameOrNameKey, 'UI', initialValue);
    }

    public key(key: string | number): UserEvent<P,V> {
        let event = this._children.get(key);
        if(event === undefined) {
            event = new UserEvent<P, V>({name: this.name, key: key}, this._initialValue);
            this._children.set(key, event);
        }
        return event;
    }

    public keys(...keys: (string | number)[]): UserEvent<P,V>[] {
        return keys.map(key => this.key(key));
    }
}

export class FlowEvent<P = void, V = string> extends EventCore<P, V> {
    constructor(nameOrNameKey: string | NameKeyId, initialValue?: P) {
        super(nameOrNameKey, 'FIBER', initialValue);
    }
}

export class FlowEventKeyed<P = void, V = string> extends EventCoreKeyed<FlowEvent<P,V>, P> {
    constructor(nameOrNameKey: string, initialValue?: P) {
        super(nameOrNameKey, 'FIBER', initialValue);
    }

    public key(key: string | number): FlowEvent<P,V> {
        let event = this._children.get(key);
        if(event === undefined) {
            event = new FlowEvent<P, V>({name: this.name, key: key}, this._initialValue);
            this._children.set(key, event);
        }
        return event;
    }

    public keys(...keys: (string | number)[]): FlowEvent<P,V>[] {
        return keys.map(key => this.key(key));
    }
}