
import * as Fc from "@flowcards/core";
import { observable, decorate } from "mobx";
import { StartReplay } from '../../core/src/index';

export * from '@flowcards/core';

export class Store {
  public context: Fc.ScenariosContext;
  private _startReplay: StartReplay;

  constructor(stagingFunction: Fc.StagingFunction) {
    [this.context, this._startReplay] = Fc.scenarios(stagingFunction, (updatedContext: Fc.ScenariosContext) => {
      this.context = updatedContext;
    });
  }
  event = this.context.event;
  actionLog = this.context.log;
  thread = this.context.thread;
  startReplay = this._startReplay;
}

decorate(Store, {
  context: observable
});