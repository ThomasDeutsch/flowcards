
import * as Fc from "@flowcards/core";
import { computedFn } from "mobx-utils";
import { observable, decorate, computed } from "mobx";

export * from '@flowcards/core';

class FlowcardsStore {
  public context: Fc.ScenariosContext;
  public rawDispatch: Fc.EventDispatch;
  public dispatch = (event: Fc.FCEvent | string, payload?: any ) => {
    const evt = Fc.toEvent(event);
    return this._internalDispatch(evt.name, evt.key, payload || undefined);
  }

  constructor(stagingFunction: Fc.StagingFunction) {
    [this.context, this.rawDispatch] = Fc.scenarios(stagingFunction, (updatedContext: Fc.ScenariosContext) => {
      this.context = updatedContext;
    });
  }
  _internalDispatch = computedFn(function(this: FlowcardsStore, eventName: string, eventKey: string | number | undefined, payload: any) {
    return this.context.dispatch({name: eventName, key: eventKey}, payload);
  });
  latest = computedFn(function(this: FlowcardsStore, eventName: string, eventKey: string | number) {
    return this.context.latest(eventName, eventKey);
  });
  isPending = computedFn(function(this: FlowcardsStore, eventName: string, eventKey?: string | number) {
    return this.context.isPending(eventName, eventKey);
  });
  get bTState() {
    return this.context.bTState;
  }
}

decorate(FlowcardsStore, {
  context: observable,
  bTState: computed
});


export const Store = FlowcardsStore;