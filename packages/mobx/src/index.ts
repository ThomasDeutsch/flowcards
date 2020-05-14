
import * as Fc from "@flowcards/core";
import { computedFn } from "mobx-utils";
import { observable, decorate, computed } from "mobx";
import { FCEvent } from '../../core/build/event';
import { toEvent } from '../../core/src/event';

export * from '@flowcards/core';

export class Store {
  public context: Fc.ScenariosContext;

  constructor(stagingFunction: Fc.StagingFunction) {
    [this.context] = Fc.scenarios(stagingFunction, (updatedContext: Fc.ScenariosContext) => {
      this.context = updatedContext;
    });
  }
  dispatch = computedFn(function(this: Store, event: string | FCEvent, payload: any) {
    event = toEvent(event);
    return this.context.dispatch(event, payload);
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