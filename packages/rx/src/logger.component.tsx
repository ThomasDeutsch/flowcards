import { Log } from "@flowcards/core";
import { ReactElement } from "react";

export function Logger(log?: Log): ReactElement {
    if(!log) {
        return <div>no log</div>;
    }
    else return <div>todo: log</div>;
}