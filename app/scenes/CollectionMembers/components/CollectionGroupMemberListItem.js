// @flow
import * as React from "react";
import styled from "styled-components";
import CollectionGroupMembership from "models/CollectionGroupMembership";
import Group from "models/Group";
import { DropdownMenu, DropdownMenuItem } from "components/DropdownMenu";
import GroupListItem from "components/GroupListItem";
import InputSelect from "components/InputSelect";

const PERMISSIONS = [
  { label: "Read only", value: "read" },
  { label: "Read & Edit", value: "read_write" },
];
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
  return (
    <GroupListItem
      group={group}
      onRemove={onRemove}
      onUpdate={onUpdate}
      renderActions={({ openMembersModal }) => (
        <>
          <Select
            label="Permissions"
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
            <DropdownMenu>
              <DropdownMenuItem onClick={openMembersModal}>
                Members…
              </DropdownMenuItem>
              <hr />
              <DropdownMenuItem onClick={onRemove}>Remove</DropdownMenuItem>
            </DropdownMenu>
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
