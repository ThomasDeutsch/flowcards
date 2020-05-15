
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
  dispatch = computedFn(function(this: Store, event: FCEvent | string, payload: any) {
    event = Fc.toEvent(event);
    return this.context.dispatch(event, payload);
  });
  latest = computedFn(function(this: Store, event: FCEvent | string) {
    event = Fc.toEvent(event);
    return this.context.latest(event.name, event.key);
  });
  isPending = computedFn(function(this: Store, event: FCEvent | string) {
    event = Fc.toEvent(event);
    return this.context.isPending(event.name, event.key);
  });
}

decorate(Store, {
  context: observable
});