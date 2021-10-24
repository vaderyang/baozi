// @flow
import { flattenDeep } from "lodash";
import * as React from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  Action,
  ActionContext,
  CommandBarAction,
  MenuItemClickable,
  MenuItemWithChildren,
} from "types";

export function createAction(
  definition: $Diff<Action, { id?: string }>
): Action {
  return {
    id: uuidv4(),
    ...definition,
  };
}

export function actionToMenuItem(
  action: Action,
  context: ActionContext
): MenuItemClickable | MenuItemWithChildren {
  function resolve<T>(value: any): T {
    if (typeof value === "function") {
      return value(context);
    }

    return value;
  }

  const resolvedIcon = resolve<React.Element<any>>(action.icon);
  const resolvedChildren = resolve<Action[]>(action.children);

  const visible = action.visible ? action.visible(context) : true;
  const title = resolve<string>(action.name);
  const icon =
    resolvedIcon && action.iconInContextMenu !== false
      ? React.cloneElement(resolvedIcon, { color: "currentColor" })
      : undefined;

  if (resolvedChildren) {
    return {
      title,
      icon,
      items: resolvedChildren
        .map((a) => actionToMenuItem(a, context))
        .filter((a) => !!a),
      visible,
    };
  }

  return {
    title,
    icon,
    visible,
    onClick: () => action.perform && action.perform(context),
    selected: action.selected ? action.selected(context) : undefined,
  };
}

export function actionToKBar(
  action: Action,
  context: ActionContext
): CommandBarAction[] {
  function resolve<T>(value: any): T {
    if (typeof value === "function") {
      return value(context);
    }

    return value;
  }

  if (typeof action.visible === "function" && !action.visible(context)) {
    return [];
  }

  const resolvedIcon = resolve<React.Element<any>>(action.icon);
  const resolvedChildren = resolve<Action[]>(action.children);
  const resolvedSection = resolve<string>(action.section);
  const resolvedName = resolve<string>(action.name);
  const resolvedPlaceholder = resolve<string>(action.placeholder);

  const children = resolvedChildren
    ? flattenDeep(resolvedChildren.map((a) => actionToKBar(a, context))).filter(
        (a) => !!a
      )
    : [];

  return [
    {
      id: action.id,
      name: resolvedName,
      section: resolvedSection,
      placeholder: resolvedPlaceholder,
      keywords: `${action.keywords || ""} ${children
        .filter((c) => !!c.keywords)
        .map((c) => c.keywords)
        .join(" ")}`,
      shortcut: action.shortcut,
      icon: resolvedIcon
        ? React.cloneElement(resolvedIcon, { color: "currentColor" })
        : undefined,
      perform: action.perform
        ? () => action.perform && action.perform(context)
        : undefined,
      children: children.length ? children.map((a) => a.id) : undefined,
    },
  ].concat(
    children.map((child) => ({
      ...child,
      parent: action.id,
    }))
  );
}
