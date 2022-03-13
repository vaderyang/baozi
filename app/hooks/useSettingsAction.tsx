import { SettingsIcon } from "outline-icons";
import * as React from "react";
import { createAction } from "~/actions";
import { NavigationSection } from "~/actions/sections";
import history from "~/utils/history";
import useAuthorizedSettingsConfig from "./useAuthorizedSettingsConfig";

const useSettingsActions = () => {
  const config = useAuthorizedSettingsConfig();
  const actions = React.useMemo(() => {
    return config.map((item) => {
      const Icon = item.icon;
      return {
        id: item.path,
        name: item.name,
        icon: <Icon color="currentColor" />,
        section: NavigationSection,
        perform: () => history.push(item.path),
      };
    });
  }, [config]);

  const navigateToSettings = React.useMemo(
    () =>
      createAction({
        name: ({ t }) => t("Settings"),
        section: NavigationSection,
        shortcut: ["g", "s"],
        icon: <SettingsIcon />,
        children: () => actions,
      }),
    [actions]
  );

  return navigateToSettings;
};

export default useSettingsActions;
