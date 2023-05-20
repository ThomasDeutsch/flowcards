import { AccumulatedValidationResults, explainValidation } from "./payload-validation";
import { ExternalAction, RejectPendingRequestAction, ResolvePendingRequestAction } from "./action";
import { EventInformation } from "./bid";
import { ActionReactionLogger } from "./action-reaction-logger";
import { getKeyFromId } from "./utils";
import { InvalidBidReason, invalidReasonsForAskForBid } from "./bid-invalid-reasons";

/**
 * usually, events are stored in a nested record, where the key is the event name.
 * This is a helper type to get the events from a nested record.
 */
export type NestedEventObject = Event<any, any> | EventByKey<any, any> | { [key: string]: NestedEventObject };

/**
 * helper function to get all events from a nested event object
 * @param neo Event object
 * @returns an array of all events in the nested event object
 */
export function getEvents(neo: NestedEventObject): Event<any, any>[] {
    if(neo instanceof Event) return [neo];
    return Object.values(neo).map(getEvents).flat();
}

// CORE FUNCTIONS -----------------------------------------------------------------------------------------------

/**
 * events are used as a way to communicate between the flows/scheduler and the user.
 * events are created by the user and are used by the scheduler/flows.
 * the event object holds the information about the event, and with the dispatch function, a possibility to interact with the flows.
 */
export class Event<P = undefined, V = void> {
    public readonly id: string;
    private _value?: P;
    private _executeAction?: (action: ExternalAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction) => void;
    private _getEventInformation?: (eventId: string) => EventInformation<P, V> | undefined;
    private _onUpdateCallback?: () => void; // only a single subscriber is supported
    private _logger?: ActionReactionLogger;
    private _description?: string;
    private _latestUpdateOnActionId?: number;
    private _relatedValidationEvents = new Map<string, Event<any, any>>();

    constructor(id: string | string, onUpdateCallback?: () => void) {
        this._onUpdateCallback = onUpdateCallback;
        this.id = id;
    }

    /**
     * @internal
     * reset the event to its initial state
     */
    public __reset(): void {
        this._value = undefined;
        this._executeAction = undefined;
        this._getEventInformation = undefined;
        this._logger = undefined;
        this._latestUpdateOnActionId = undefined;
        this._relatedValidationEvents.clear();
    }

    /**
     * @internal
     * connect this event to the scheduler by receiving two functions from the scheduler
     * @param getEventInformation a function that returns the event information of this event
     * @param addActionToQueue the function to add an action to the queue
     */
    public __connectToScheduler(getEventInformation: (eventId: string) => EventInformation<P, V> | undefined, executeAction: (action: ExternalAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction) => void, logger: ActionReactionLogger): void {
        this._getEventInformation = getEventInformation;
        this._executeAction = executeAction;
        this._logger = logger;
    }

    /**
     * @internal
     * set the value of the event.
     * @param value the new value of the event.
     * @remarks this function should only be called by the scheduler.
     */
    public __setValue(value: P): void {
        this._value = value;
    }

    /**
     * get the current value of the event
     * @returns the current value of the event
     */
    public get value(): P | undefined {
        this._logger?.logEventAccess(this);
        if(this._value !== undefined && typeof this._value === 'object') {
            return Object.freeze(this._value);
        }
        return this._value;
    };

    /**
     * add a a callback, that is called every time the event is updated.
     * An update is triggered by the scheduler, and will be triggered in the following cases:
     * - the event value is updated
     * - the event pending state is updated (pending extend or pending request)
     * - the event blocked state is updated
     * - the event highest priority ask for is updated
     * - any event in the validation function(s) is updated
     * @param callback the callback to call when the event value changes
     */
    public registerCallback(callback: () => void, sendInitial?: boolean): void {
        this._onUpdateCallback = callback;
        if(sendInitial) callback();
    }

    /**
     * @internal
     * Get all invalid reasons why the event has not a valid askFor bid.
     * Payload validations are not checked in this function.
     * To check if the payload is valid, use the validate function.
     * @returns an explanation why the highest priority askFor bid is not valid.
     */
    private _invalidReasons() {
        return invalidReasonsForAskForBid(this._getEventInformation?.(this.id));
    }

    /**
     * validate if a value is valid for the event. If the value is valid, then the event can be set with the value.
     * @param value the value to validate
     * @returns an object with the validation result and the details of the validation
     */
    public validate(value: P): {isValidAccumulated: boolean, invalidBidReasons?: InvalidBidReason[], payloadValidation?: AccumulatedValidationResults<V>} {
        const invalidBidReasons = this._invalidReasons();
        if(invalidBidReasons) return {isValidAccumulated: false, invalidBidReasons };
        const eventInfo = this._getEventInformation?.(this.id) as EventInformation<P, V>; // guaranteed to be valid because of the invalidReasons check
        this._logger?.startValueAccessLogging(this); // TODO: move startValueAccessLogging to the scheduler ???
        const validationResult = explainValidation(eventInfo, value, [eventInfo.askFor?.[0]]) || {isValidAccumulated: false};
        this._logger?.stopValueAccessLogging();
        return validationResult;
    }

    /**
     * returns true if the event is valid, false otherwise
     * this is a shortcut for calling the explain function and checking if the result is valid
     * @param value the value to check
     * @returns true if the event is valid, false otherwise
     */
    public isValid(value: P): boolean {
        return this.validate(value)?.isValidAccumulated === true;
    }

    /**
     * add an external action to the queue and start a new microtask that runs the scheduler.
     * A dispatch is only possible if the value for that event is valid. You can check if the event is valid by calling the explain function or the isValid function.
     * @param value the next event value
     * @returns true if the dispatch added an action to the queue, false otherwise.
     * @remarks before the action is added to the queue, the event value will be validated, by using the explain function.
     */
    public dispatch(value: P) {
        const validationResult = this.validate(value);
        if(!validationResult.isValidAccumulated) {
            console.group('INVALID DISPATCH', this.id);
            if(validationResult.invalidBidReasons) {
                console.log('invalid bid reasons: %O', validationResult.invalidBidReasons);
            }
            else {
                console.log('invalid payload');
                if(validationResult.payloadValidation) {
                    console.log('payload validation: %O', validationResult.payloadValidation);
                }
            }
            console.info('Info: before dispatching the event, validate with event.isValid(<value>)');
            console.groupEnd();
            throw new Error('event can not be dispatched');
        }
        // because the explain has checked if the event is valid, it is ok to use the ! in this function.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const eventInformation = this._getEventInformation!(this.id)!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const highestPriorityAskForBid = eventInformation.askFor?.[0]!;
        const action: ExternalAction<P> = {
            type: "external",
            payload: value,
            id: null,
            eventId: this.id,
            flowId: highestPriorityAskForBid.flow.id,
            bidId: highestPriorityAskForBid.id
        };
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this._executeAction!(action);
    }

    /**
     * @internal
     * trigger the updateCallback. This is called by the scheduler.
     */
    public __triggerUpdateCallback(actionId: number): void {
        if(this._latestUpdateOnActionId === actionId) return;
        this._latestUpdateOnActionId = actionId;
        this._onUpdateCallback?.();
        this._relatedValidationEvents.forEach((event) => event.__triggerUpdateCallback(actionId));
        this._relatedValidationEvents = new Map();
    }

    /**
     * @internal
     * add a related validation event.
     * a related validation event is an event that has this accessed this event in its validation function.
     * so that if this event is updated, the related validation of the other event needs to be updated as well.
     * @param event the event to add
     **/
    public __addRelatedValidationEvent(event: Event<P, V>): void {
        if(event == this) return;
        this._relatedValidationEvents.set(event.id, event);
    }

    /**
     * returns true if the event had a placed bid by any of the flows.
     */
    public get wasUsedInAFlow(): boolean {
        return !!this._getEventInformation;
    }

    /**
     * returns true if the event is blocked, false otherwise.
     * An event is blocked if there is a flow that has a placed block bid for that event.
     */
    public get isBlocked() {
        this._logger?.logEventAccess(this);
        return (this._getEventInformation?.(this.id)?.block?.length || 0) > 0;
    }

    /**
     * returns true if the event is asked for, false otherwise.
     * An event is asked for if there is a flow that has a placed ask for bid for that event.
     * Only asked for events can be set, to have a new value.
     */
    public get isAskedFor(): boolean {
        this._logger?.logEventAccess(this);
        return this._getEventInformation?.(this.id)?.askFor?.[0] !== undefined;
    }

    /**
     * getter that returns true if the event has a pending request or a pending extend, false otherwise.
     */
    public get isPending(): boolean {
        this._logger?.logEventAccess(this);
        const pendingRequest = this._getEventInformation?.(this.id)?.pendingRequest !== undefined;
        const pendingExtend = this._getEventInformation?.(this.id)?.pendingExtend !== undefined;
        return pendingRequest || pendingExtend;
    }

    /**
     * returns the currently extended value for the event.
     */
    public get extendedValue(): P | undefined {
        this._logger?.logEventAccess(this);
        return this._getEventInformation?.(this.id)?.pendingExtend?.value;
    }

    /**
     * set the description for the event and return the event.
     * @param description the description for the event.
     */
    public setDescription(description: string): this {
        this._description = description;
        return this;
    }

    /**
     * get the description for the event.
     * @returns the description for the event.
     */
    public get description(): string | undefined {
        return this._description;
    }
}


/**
 * keyed events allow multiple instances on one event-type, without the need to create events with new Event() for each instance.
 * a keyed event is a container for multiple events with the same name, payload-type and validation-type.
 * A keyed event will provide multiple methods to access the events.
 */
export class EventByKey<P = void, V = void> {
    public readonly name: string;
    protected _children = new Map<string, Event<P,V>>();

    constructor(name: string) {
        this.name = name;
    }

    /**
     * get the event for the given key.
     * if the event does not exist, it will be created.
     * @param key the key to get the event for.
     * @returns the event for the given key.
     */
    public getEvent(key: string): Event<P,V> {
        let event = this._children.get(key);
        if(event === undefined) {
            const id: string = `${this.name}__key:${key}`;
            event = new Event<P, V>(id);
            this._children.set(key, event);
        }
        return event;
    }

    /**
     * for the given keys, return the corresponding events.
     * @param keys the keys to get the events for.
     * @returns the events for the given keys.
     */
    public getEvents(...keys: string[]): Event<P,V>[] {
        return keys.map(key => this.getEvent(key));
    }

    /**
     * get all keys
     * @returns all keys that are contained in this keyed event.
     */
    public allKeys(): string[] {
        return [...this._children].map(([k]) => getKeyFromId(k));
    }

    /**
     * get all events
     * @returns all events that are contained in this keyed event.
     */
    public get allEvents(): Event<P,V>[] {
        return [...this._children].map(([_, e]) => e);
    }

    /**
     * remove the event for the given key.
     * @returns boolean that indicates if the event was removed.
     */
    public removeEvent(key: string): boolean {
        return this._children.delete(key);
    }
}