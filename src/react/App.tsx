import * as React from "react";
import "./styles.css";
import useScenarios from "./usescenarios";
import bp from "./bp/index";

function delayRejected(ms: number, resolveValue?: any) {
  return new Promise((resolve, reject) =>
    setTimeout(() => reject(new Error("invalid order")), ms)
  );
}

// ------------------------------------ SCENARIOS

function* orders() {
  for (var i = 0; i < 5; i++) {
    try {
      yield bp.request(`order`, () => delayRejected(2000));
    } catch ({ eventName, error }) {
      console.log("error: ", eventName, error);
    }
  }
}

// ------------------------------------ LOGGING
const logger = new bp.Logger();

function PlayLog({ logger }: any) {
  const { pastActions, pendingEventNames } = logger.getActionLog();
  const items = pastActions.map((en: string, index: number) => (
    <div className="logitem" key={index}>
      <span className="circle" />
      {en}
    </div>
  ));
  const pendingItems = [...pendingEventNames].map(en => (
    <div className="logitem empty">
      <span className="circle half" />
      {en}
    </div>
  ));
  return (
    <div className="playlog">
      <div>{items}</div>
      <div>{pendingItems}</div>
    </div>
  );
}

// ------------------------------------ MAIN

export default function App() {
  useScenarios((enable: any) => {
    enable(orders);
  }, logger);
  return (
    <div className="App">
      <PlayLog logger={logger} />
    </div>
  );
}
