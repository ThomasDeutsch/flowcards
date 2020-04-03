/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import { useRef, FunctionComponent, ComponentClass } from "react";
import { OverridesByComponent } from "@flowcards/core";

function maybeMerge(a: Record<string, any>, b?: Record<string, any>): Record<string, any> {
    return a && b ? { ...a, ...b } : a || b;
}

type ReactComponent = FunctionComponent<{}> | ComponentClass<{}, any>;
type ComponentDictionary = Record<string, ReactComponent>;

// from: https://github.com/tlrobinson/overrides
function applyOverride(override: any, Component: ReactComponent, props: any = {}): [ReactComponent, any] {
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
            props = maybeMerge(props, typeof style === "function" ? propsOverride(props) : propsOverride);            
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

function mergeOverrides(component: any, props: any, overrides: any[]): [ReactComponent, any] {
    return overrides.reduce(([c, p], o): [ReactComponent, any] => applyOverride(o, c, p), [component, props]);
}

type getOverridesFunction = (componentName: string) => any[];

function initializeOverrideWrappers(defaultComponents: Record<string, ReactComponent>, getOverrides: getOverridesFunction): Record<string, ReactComponent> {
    const components: Record<string, ReactComponent> = {};
    for (const name of Object.keys(defaultComponents)) {
      components[name] = React.forwardRef((props: any, ref: any): any => { // this is the wrapper component
        const overrides = getOverrides(name);
        const [Component, mergedProps] = mergeOverrides(defaultComponents[name], props, overrides);
        return React.createElement(Component, Object.assign({ ref: ref }, mergedProps), props.children);
      });
      components[name].displayName = `${name}_Overridable`;
    }
    return components;
  }

export function useOverrides(defaultComponents: Record<string, any>, overrideByComponent: OverridesByComponent): ComponentDictionary {
    const overrideDictRef: any = useRef<ComponentDictionary>({});
    overrideDictRef.current = overrideByComponent;
    return React.useMemo<ComponentDictionary>((): ComponentDictionary => 
        initializeOverrideWrappers(defaultComponents, (componentName: string): any[] => overrideDictRef.current[componentName] || {})
    , [defaultComponents]);
}