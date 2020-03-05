/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import * as React from "react";
import { useRef, FunctionComponent, Component } from "react";
import { OverridesByComponent } from "@flowcards/core";

function maybeMerge(a: Record<string, any>, b?: Record<string, any>): Record<string, any> {
    return a && b ? { ...a, ...b } : a || b;
}

type ReactComponent = FunctionComponent<any> | Component<any>;

interface Dictionary<T> {
    [Key: string]: T;
}

type ComponentDictionary = Dictionary<ReactComponent>;


// from: https://github.com/tlrobinson/overrides
function applyOverride(override: any, Component: ReactComponent, props: any = {}) {
    // component override shortcut:
    if (typeof override === "function" || typeof override === "string" || override instanceof React.Component) {
        Component = override;
    } else if (override) {
        const { style, props: propsOverride, component, ...nested } = override;
        props = { ...props };
        if (component) {  // component override
            Component = component;
        }
        if (propsOverride) { // props override
            props = {...props, ...propsOverride};
        }
        if (style) { // style override
            props.style = maybeMerge(props.style, typeof style === "function" ? style(props) : style);
        }
        if (Object.keys(nested).length > 0) { // nested overrides:
            props.overrides = maybeMerge(props.overrides, nested);
        }
    }
    return [Component, props];
}

function mergeOverrides(component: any, props: any, overrides: any[]) {
    return overrides.reduce(([c, p], o) => applyOverride(o, c, p), [component, props]);
}

function getOverrideComponent(DefaultComponent: ReactComponent, overrides: any, name: string) {
    const Comp = React.memo((props: any) => {
        const [Component, mergedProps] = mergeOverrides(DefaultComponent, props, overrides);
        return React.createElement(Component, {...mergedProps}, null);
    });
    Comp.displayName = `${name}_override`;
    return Comp;
}

export default function useOverrides(defaultComponents: ComponentDictionary, override: OverridesByComponent): ComponentDictionary {
    const overrideDict: any = useRef<ComponentDictionary>({});
    return Object.keys(defaultComponents).reduce((acc:any, name) => {
        if(!override[name]) {
            delete overrideDict.current[name];
            acc[name] = defaultComponents[name];
            return acc;
        }
        if(!overrideDict.current[name] || overrideDict.current[name].id !== override[name].id) {
            overrideDict.current[name] = {
                id: override[name].id,
                component: getOverrideComponent(defaultComponents[name], override[name].overrides, name)
            }
        }
        acc[name] = overrideDict.current[name].component;
        return acc;
    }, {});
}