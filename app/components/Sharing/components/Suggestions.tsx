import { isEmail } from "class-validator";
import { observer } from "mobx-react";
import { CheckmarkIcon, CloseIcon, GroupIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import Squircle from "@shared/components/Squircle";
import { s } from "@shared/styles";
import { stringToColor } from "@shared/utils/color";
import Collection from "~/models/Collection";
import Document from "~/models/Document";
import Group from "~/models/Group";
import User from "~/models/User";
import Avatar from "~/components/Avatar";
import { AvatarSize, IAvatar } from "~/components/Avatar/Avatar";
import Empty from "~/components/Empty";
import Placeholder from "~/components/List/Placeholder";
import useCurrentUser from "~/hooks/useCurrentUser";
import useStores from "~/hooks/useStores";
import useThrottledCallback from "~/hooks/useThrottledCallback";
import { hover } from "~/styles";
import { InviteIcon, ListItem } from "./ListItem";

type Suggestion = IAvatar & {
  id: string;
};

type Props = {
  /** The document being shared. */
  document?: Document;
  /** The collection being shared. */
  collection?: Collection;
  /** The search query to filter users by. */
  query: string;
  /** A list of pending user ids that have not yet been invited. */
  pendingIds: string[];
  /** Callback to add a user to the pending list. */
  addPendingId: (id: string) => void;
  /** Callback to remove a user from the pending list. */
  removePendingId: (id: string) => void;
  /** Show group suggestions. */
  showGroups?: boolean;
};

export const Suggestions = observer(
  ({
    document,
    collection,
    query,
    pendingIds,
    addPendingId,
    removePendingId,
    showGroups,
  }: Props) => {
    const neverRenderedList = React.useRef(false);
    const { users, groups } = useStores();
    const { t } = useTranslation();
    const user = useCurrentUser();
    const theme = useTheme();

    const fetchUsersByQuery = useThrottledCallback(
      (params) => {
        void users.fetchPage({ query: params.query });

        if (showGroups) {
          void groups.fetchPage({ query: params.query });
        }
      },
      250,
      undefined,
      {
        leading: true,
      }
    );

    const getSuggestionForEmail = React.useCallback(
      (email: string) => ({
        id: email,
        name: email,
        avatarUrl: "",
        color: stringToColor(email),
        initial: email[0].toUpperCase(),
        email: t("Invite to workspace"),
      }),
      [t]
    );

    const suggestions = React.useMemo(() => {
      const filtered: Suggestion[] = (
        document
          ? users.notInDocument(document.id, query)
          : collection
          ? users.notInCollection(collection.id, query)
          : users.orderedData
      ).filter((u) => u.id !== user.id && !u.isSuspended);

      if (isEmail(query)) {
        filtered.push(getSuggestionForEmail(query));
      }

      if (collection?.id) {
        return [...groups.notInCollection(collection.id, query), ...filtered];
      }

      return filtered;
    }, [
      getSuggestionForEmail,
      users,
      users.orderedData,
      document?.id,
      document?.members,
      collection?.id,
      user.id,
      query,
      t,
    ]);

    const pending = React.useMemo(
      () =>
        pendingIds
          .map((id) =>
            isEmail(id)
              ? getSuggestionForEmail(id)
              : users.get(id) ?? groups.get(id)
          )
          .filter(Boolean) as User[],
      [users, getSuggestionForEmail, pendingIds]
    );

    React.useEffect(() => {
      void fetchUsersByQuery(query);
    }, [query, fetchUsersByQuery]);

    function getListItemProps(suggestion: User | Group) {
      if (suggestion instanceof Group) {
        return {
          title: suggestion.name,
          subtitle: t("{{ count }} member", {
            count: suggestion.memberCount,
          }),
          image: (
            <Squircle color={theme.text} size={AvatarSize.Medium}>
              <GroupIcon color={theme.background} size={16} />
            </Squircle>
          ),
        };
      }
      return {
        title: suggestion.name,
        subtitle: suggestion.email
          ? suggestion.email
          : suggestion.isViewer
          ? t("Viewer")
          : t("Editor"),
        image: (
          <Avatar
            model={suggestion}
            size={AvatarSize.Medium}
            showBorder={false}
          />
        ),
      };
    }

    const isEmpty = suggestions.length === 0;
    const suggestionsWithPending = suggestions.filter(
      (u) => !pendingIds.includes(u.id)
    );

    if (users.isFetching && isEmpty && neverRenderedList.current) {
      return <Placeholder />;
    }

    neverRenderedList.current = false;

    return (
      <>
        {pending.map((suggestion) => (
          <PendingListItem
            {...getListItemProps(suggestion)}
            key={suggestion.id}
            onClick={() => removePendingId(suggestion.id)}
            actions={
              <>
                <InvitedIcon />
                <RemoveIcon />
              </>
            }
          />
        ))}
        {pending.length > 0 &&
          (suggestionsWithPending.length > 0 || isEmpty) && <Separator />}
        {suggestionsWithPending.map((suggestion) => (
          <ListItem
            {...getListItemProps(suggestion as User)}
            key={suggestion.id}
            onClick={() => addPendingId(suggestion.id)}
            actions={<InviteIcon />}
          />
        ))}
        {isEmpty && <Empty style={{ marginTop: 22 }}>{t("No matches")}</Empty>}
      </>
    );
  }
);

const InvitedIcon = styled(CheckmarkIcon)`
  color: ${s("accent")};
`;

const RemoveIcon = styled(CloseIcon)`
  display: none;
`;

const PendingListItem = styled(ListItem)`
  &: ${hover} {
    ${InvitedIcon} {
      display: none;
    }

    ${RemoveIcon} {
      display: block;
    }
  }
`;

const Separator = styled.div`
  border-top: 1px dashed ${s("divider")};
  margin: 12px 0;
`;
