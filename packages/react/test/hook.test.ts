test("Todo: add hook tests", () => {
    expect(1).toEqual(1);
});


// TESTCASES
// when a component gets rerendered, the last action is not evaluated
// whan a component gets rerendered, the enable function gets called and the new props will get evaluated.


// a replay will ....


import * as React from "react";
import { flow, wait, trigger, request, set, useScenarios, on, extend, BTContext, block } from "../src/index";
function delay(ms: number, value?: any) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}


test("this is possible", (done) => {
    const flow1 = flow(
        {
          id: "flow1",
          title: "card validation scenario"
        },
        function*() {
          console.log("o");
          yield request("WaitForCard", () => delay(3000));
          console.log("1");
          yield request("ValidateCard", () => delay(1000000));
          console.log("2");
          yield request("LoadAccount", () => delay(3000));
          console.log("3");
          yield request("WaitForPin", () => delay(3000));
        }
      );
      
       function App() {
        const [context, dispatch] = useScenarios((enable, cache) => {
          enable(flow1());
          done();
        });
      }
})
