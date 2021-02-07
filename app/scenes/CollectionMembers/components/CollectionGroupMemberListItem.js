// @flow
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import CollectionGroupMembership from "models/CollectionGroupMembership";
import Group from "models/Group";
import GroupListItem from "components/GroupListItem";
import InputSelect from "components/InputSelect";
import CollectionGroupMemberMenu from "menus/CollectionGroupMemberMenu";

type Props = {
  group: Group,
  collectionGroupMembership: ?CollectionGroupMembership,
  onUpdate: (permission: string) => void,
  onRemove: () => void,
};

const MemberListItem = ({
  group,
  collectionGroupMembership,
  onUpdate,
  onRemove,
}: Props) => {
  const { t } = useTranslation();

  const PERMISSIONS = React.useMemo(
    () => [
      { label: t("Read only"), value: "read" },
      { label: t("Read & Edit"), value: "read_write" },
    ],
    [t]
  );

  return (
    <GroupListItem
      group={group}
      onRemove={onRemove}
      onUpdate={onUpdate}
      renderActions={({ openMembersModal }) => (
        <>
          <Select
            label={t("Permissions")}
            options={PERMISSIONS}
            value={
              collectionGroupMembership
                ? collectionGroupMembership.permission
                : undefined
            }
            onChange={(ev) => onUpdate(ev.target.value)}
            labelHidden
          />
          <ButtonWrap>
            <CollectionGroupMemberMenu
              onMembers={openMembersModal}
              onRemove={onRemove}
            />
          </ButtonWrap>
        </>
      )}
    />
  );
};

const Select = styled(InputSelect)`
  margin: 0;
  font-size: 14px;
`;

const ButtonWrap = styled.div`
  margin-left: 6px;
`;

export default MemberListItem;
