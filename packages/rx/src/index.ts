import * as Rx from "rxjs";
import * as Fc from "@flowcards/core";

export * from '@flowcards/core';

export function scenariosSubject(stagingFunction: Fc.StagingFunction): Rx.BehaviorSubject<Fc.ScenariosContext> {
    const subject = new Rx.BehaviorSubject<Fc.ScenariosContext>(
      Fc.scenarios(
        stagingFunction,
        (a: Fc.ScenariosContext): void => {
          subject.next(a);
        },
        false
      )
    );
    return subject;
}