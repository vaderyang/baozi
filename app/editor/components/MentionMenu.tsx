import * as React from "react";
import { useTranslation } from "react-i18next";
import { v4 } from "uuid";
import { MenuItem } from "@shared/editor/types";
import { MentionType } from "@shared/types";
import User from "~/models/User";
import Avatar from "~/components/Avatar";
import Flex from "~/components/Flex";
import useRequest from "~/hooks/useRequest";
import useStores from "~/hooks/useStores";
import CommandMenu, { Props } from "./CommandMenu";
import MentionMenuItem from "./MentionMenuItem";

interface MentionItem extends MenuItem {
  name: string;
  user: User;
  appendSpace: boolean;
  attrs: {
    id: string;
    type: MentionType;
    modelId: string;
    label: string;
    actorId?: string;
  };
}

type MentionMenuProps = Omit<
  Props<MentionItem>,
  "renderMenuItem" | "items" | "onLinkToolbarOpen" | "embeds" | "onClearSearch"
>;

function MentionMenu({ search, ...rest }: MentionMenuProps) {
  const [items, setItems] = React.useState<MentionItem[]>([]);
  const { t } = useTranslation();
  const { users, auth } = useStores();
  const { data, request } = useRequest(
    React.useCallback(() => users.fetchPage({ query: search }), [users, search])
  );

  React.useEffect(() => {
    request();
  }, [request]);

  React.useEffect(() => {
    if (data) {
      setItems(
        data.map((user) => ({
          name: "mention",
          user,
          title: user.name,
          appendSpace: true,
          attrs: {
            id: v4(),
            type: MentionType.User,
            modelId: user.id,
            actorId: auth.user?.id,
            label: user.name,
          },
        }))
      );
    }
  }, [auth.user?.id, data]);

  const clearSearch = () => {
    const { state, dispatch } = rest.view;

    // clear search input
    dispatch(
      state.tr.insertText(
        "",
        state.selection.$from.pos - (search ?? "").length - 1,
        state.selection.to
      )
    );
  };

  const containerId = "mention-menu-container";
  return (
    <CommandMenu
      {...rest}
      id={containerId}
      filterable={false}
      onClearSearch={clearSearch}
      search={search}
      renderMenuItem={(item, _index, options) => (
        <MentionMenuItem
          onClick={options.onClick}
          selected={options.selected}
          title={item.title}
          label={item.attrs.label}
          containerId={containerId}
          icon={
            <Flex
              align="center"
              justify="center"
              style={{ width: 24, height: 24 }}
            >
              <Avatar
                model={item.user}
                showBorder={false}
                alt={t("Profile picture")}
                size={16}
              />
            </Flex>
          }
        />
      )}
      items={items}
    />
  );
}

export default MentionMenu;
