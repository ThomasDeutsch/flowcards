
import * as Fc from "@flowcards/core";
import { computedFn } from "mobx-utils";
import { observable, decorate, computed } from "mobx";

export * from '@flowcards/core';

export class Store {
  public context: Fc.ScenariosContext;

  constructor(stagingFunction: Fc.StagingFunction) {
    [this.context] = Fc.scenarios(stagingFunction, (updatedContext: Fc.ScenariosContext) => {
      this.context = updatedContext;
    });
  }
  dispatch = computedFn(function(this: Store, eventName: string, eventKey: string | number, payload: any) {
    return this.context.dispatch({name: eventName, key: eventKey}, payload);
  });
  latest = computedFn(function(this: Store, eventName: string, eventKey: string | number) {
    return this.context.latest(eventName, eventKey);
  });
  isPending = computedFn(function(this: Store, eventName: string, eventKey?: string | number) {
    return this.context.isPending(eventName, eventKey);
  });
  get bTState() {
    return this.context.bTState;
  }
}

decorate(Store, {
  context: observable,
  bTState: computed
});