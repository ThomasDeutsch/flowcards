
import * as Fc from "@flowcards/core";
import { computedFn } from "mobx-utils";
import { observable, decorate, computed } from "mobx";

export * from '@flowcards/core';

export class FlowcardsStore {
  public context: Fc.ScenariosContext;
  public rawDispatch: Fc.EventDispatch;

  constructor(stagingFunction: Fc.StagingFunction) {
    [this.context, this.rawDispatch] = Fc.scenarios(stagingFunction, (updatedContext: Fc.ScenariosContext) => {
      this.context = updatedContext;
    }, true);
  }
  dispatch = computedFn(function(this: FlowcardsStore, eventName: string, eventKey?: string | number, payload?: any) {
    return this.context.dispatch({name: eventName, key: eventKey}, payload);
  });
  latest = computedFn(function(this: FlowcardsStore, eventName: string, eventKey?: string | number) {
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