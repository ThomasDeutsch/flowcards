
import * as Fc from "@flowcards/core";
import { observable, decorate } from "mobx";

export * from '@flowcards/core';

export class Store {
  public context: Fc.ScenariosContext;

  constructor(stagingFunction: Fc.StagingFunction) {
    [this.context] = Fc.scenarios(stagingFunction, (updatedContext: Fc.ScenariosContext) => {
      this.context = updatedContext;
    });
  }
  event = this.context.event;
  logger = this.context.log;
  thread = this.context.thread;
  startReplay = this._startReplay;
}

decorate(Store, {
  context: observable
});