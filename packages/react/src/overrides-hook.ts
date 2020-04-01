/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import { useRef, FunctionComponent, ComponentClass, ReactElement } from "react";
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

function mergeOverrides(component: any, props: any, overrides: any[]): [ReactComponent, any] {
    return overrides.reduce(([c, p], o): [ReactComponent, any] => applyOverride(o, c, p), [component, props]);
}


const isClassComponent = (Component: ReactComponent): boolean => Boolean(Component.prototype && Component.prototype.isReactComponent);

// render hijacking: https://callstack.com/blog/sweet-render-hijacking-with-react/
function withOverrides(WrappedComponent: any, overrides: any): any {
    let renderTree: any;
    if (isClassComponent(WrappedComponent)) {
      return class Enhancer extends WrappedComponent {
        // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
        render(): any {
          renderTree = super.render();
          const [Component, mergedProps] = mergeOverrides(WrappedComponent, renderTree.props, overrides);
          return React.createElement(Component, {...mergedProps}, renderTree.props.children);
        }
      };
    }
    // If WrappedComponent is functional, we extend from React.Component instead
    return class EnhancerFunctional extends React.Component {
        // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
        render(): any {
            renderTree = WrappedComponent(this.props);
            const [Component, mergedProps] = mergeOverrides(WrappedComponent, renderTree.props, overrides);
            return React.createElement(Component, {...mergedProps}, renderTree.props.children);
        }
    };
  }

function getOverrideComponent(DefaultComponent: ReactComponent, overrides: any[], name: string): ReactComponent {
    const Comp = withOverrides(DefaultComponent, overrides);
    Comp.displayName = `${name}_override`;
    return Comp;
}

export function useOverrides(defaultComponents: ComponentDictionary, override: OverridesByComponent): ComponentDictionary {
    const overrideDict: any = useRef<ComponentDictionary>({});
    return Object.keys(defaultComponents).reduce((acc:any, name): ComponentDictionary => {
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