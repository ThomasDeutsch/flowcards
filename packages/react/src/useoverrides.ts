import * as React from "react";
import { useRef } from "react";

function maybeMerge(a: Object, b?: Object) {
    return a && b ? { ...a, ...b } : a || b;
}

// from: https://github.com/tlrobinson/overrides
function applyOverride(override: any, Component: any, props: any = {}) {
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

function getOverrideComponent(DefaultComponent: any, overrides: any, name: string) {
    const Comp = React.memo((props: any) => {
        const [Component, mergedProps] = mergeOverrides(DefaultComponent, props, overrides);
        return React.createElement(Component, {...mergedProps}, null);
    });
    Comp.displayName = `${name}_override`;
    return Comp;
}

export default function useOverrides(defaultComponents: any, override: any) {
    let overrideDict: any = useRef({});
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