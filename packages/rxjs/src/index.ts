import * as Rx from "rxjs";
import * as Fc from "@flowcards/core";
import { EventDispatch } from "packages/core/src/event-dispatcher";

export * from '@flowcards/core';

export function initScenarios(stagingFunction: Fc.StagingFunction): [Rx.Observable<Fc.ScenariosContext>, EventDispatch] {
  const [init, dispatch] = Fc.scenarios(stagingFunction, (a: Fc.ScenariosContext): void => {
      subject.next(a);
  });
  const subject = new Rx.BehaviorSubject<Fc.ScenariosContext>(init);
  return [subject.asObservable(), dispatch];
}