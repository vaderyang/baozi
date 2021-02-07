// @flow
import { observable } from "mobx";
import { inject, observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import * as React from "react";
import styled from "styled-components";
import AuthStore from "stores/AuthStore";
import CollectionGroupMembershipsStore from "stores/CollectionGroupMembershipsStore";
import GroupsStore from "stores/GroupsStore";
import MembershipsStore from "stores/MembershipsStore";
import UiStore from "stores/UiStore";
import UsersStore from "stores/UsersStore";
import Collection from "models/Collection";
import Button from "components/Button";
import ButtonLink from "components/ButtonLink";
import Empty from "components/Empty";
import Flex from "components/Flex";
import HelpText from "components/HelpText";
import Modal from "components/Modal";
import PaginatedList from "components/PaginatedList";
import Subheading from "components/Subheading";
import AddGroupsToCollection from "./AddGroupsToCollection";
import AddPeopleToCollection from "./AddPeopleToCollection";
import CollectionGroupMemberListItem from "./components/CollectionGroupMemberListItem";
import MemberListItem from "./components/MemberListItem";

type Props = {
  ui: UiStore,
  auth: AuthStore,
  collection: Collection,
  users: UsersStore,
  memberships: MembershipsStore,
  collectionGroupMemberships: CollectionGroupMembershipsStore,
  groups: GroupsStore,
  onEdit: () => void,
};

@observer
class CollectionMembers extends React.Component<Props> {
  @observable addGroupModalOpen: boolean = false;
  @observable addMemberModalOpen: boolean = false;

  handleAddGroupModalOpen = () => {
    this.addGroupModalOpen = true;
  };

  handleAddGroupModalClose = () => {
    this.addGroupModalOpen = false;
  };

  handleAddMemberModalOpen = () => {
    this.addMemberModalOpen = true;
  };

  handleAddMemberModalClose = () => {
    this.addMemberModalOpen = false;
  };

  handleRemoveUser = (user) => {
    try {
      this.props.memberships.delete({
        collectionId: this.props.collection.id,
        userId: user.id,
      });
      this.props.ui.showToast(`${user.name} was removed from the collection`, {
        type: "success",
      });
    } catch (err) {
      this.props.ui.showToast("Could not remove user", { type: "error" });
    }
  };

  handleUpdateUser = (user, permission) => {
    try {
      this.props.memberships.create({
        collectionId: this.props.collection.id,
        userId: user.id,
        permission,
      });
      this.props.ui.showToast(`${user.name} permissions were updated`, {
        type: "success",
      });
    } catch (err) {
      this.props.ui.showToast("Could not update user", { type: "error" });
    }
  };

  handleRemoveGroup = (group) => {
    try {
      this.props.collectionGroupMemberships.delete({
        collectionId: this.props.collection.id,
        groupId: group.id,
      });
      this.props.ui.showToast(`${group.name} was removed from the collection`, {
        type: "success",
      });
    } catch (err) {
      this.props.ui.showToast("Could not remove group", { type: "error" });
    }
  };

  handleUpdateGroup = (group, permission) => {
    try {
      this.props.collectionGroupMemberships.create({
        collectionId: this.props.collection.id,
        groupId: group.id,
        permission,
      });
      this.props.ui.showToast(`${group.name} permissions were updated`, {
        type: "success",
      });
    } catch (err) {
      this.props.ui.showToast("Could not update user", { type: "error" });
    }
  };

  render() {
    const {
      collection,
      users,
      groups,
      memberships,
      collectionGroupMemberships,
      auth,
    } = this.props;
    const { user } = auth;
    if (!user) return null;

    const key = memberships.orderedData
      .map((m) => m.permission)
      .concat(collection.private)
      .join("-");

    return (
      <Flex column>
        {collection.private ? (
          <>
            <HelpText>
              Choose which groups and team members have access to view and edit
              documents in the private <strong>{collection.name}</strong>{" "}
              collection. You can make this collection visible to the entire
              team by{" "}
              <ButtonLink onClick={this.props.onEdit}>
                changing the visibility
              </ButtonLink>
              .
            </HelpText>
            <span>
              <Button
                type="button"
                onClick={this.handleAddGroupModalOpen}
                icon={<PlusIcon />}
                neutral
              >
                Add groups
              </Button>
            </span>
          </>
        ) : (
          <HelpText>
            The <strong>{collection.name}</strong> collection is accessible by
            everyone on the team. If you want to limit who can view the
            collection,{" "}
            <ButtonLink onClick={this.props.onEdit}>make it private</ButtonLink>
            .
          </HelpText>
        )}

        {collection.private && (
          <GroupsWrap>
            <Subheading>Groups</Subheading>
            <PaginatedList
              key={key}
              items={groups.inCollection(collection.id)}
              fetch={collectionGroupMemberships.fetchPage}
              options={collection.private ? { id: collection.id } : undefined}
              empty={<Empty>This collection has no groups.</Empty>}
              renderItem={(group) => (
                <CollectionGroupMemberListItem
                  key={group.id}
                  group={group}
                  collectionGroupMembership={collectionGroupMemberships.get(
                    `${group.id}-${collection.id}`
                  )}
                  onRemove={() => this.handleRemoveGroup(group)}
                  onUpdate={(permission) =>
                    this.handleUpdateGroup(group, permission)
                  }
                />
              )}
            />
            <Modal
              title={`Add groups to ${collection.name}`}
              onRequestClose={this.handleAddGroupModalClose}
              isOpen={this.addGroupModalOpen}
            >
              <AddGroupsToCollection
                collection={collection}
                onSubmit={this.handleAddGroupModalClose}
              />
            </Modal>
          </GroupsWrap>
        )}
        {collection.private ? (
          <>
            <span>
              <Button
                type="button"
                onClick={this.handleAddMemberModalOpen}
                icon={<PlusIcon />}
                neutral
              >
                Add individual members
              </Button>
            </span>

            <Subheading>Individual Members</Subheading>
          </>
        ) : (
          <Subheading>Members</Subheading>
        )}
        <PaginatedList
          key={key}
          items={
            collection.private
              ? users.inCollection(collection.id)
              : users.active
          }
          fetch={collection.private ? memberships.fetchPage : users.fetchPage}
          options={collection.private ? { id: collection.id } : undefined}
          renderItem={(item) => (
            <MemberListItem
              key={item.id}
              user={item}
              membership={memberships.get(`${item.id}-${collection.id}`)}
              canEdit={collection.private && item.id !== user.id}
              onRemove={() => this.handleRemoveUser(item)}
              onUpdate={(permission) => this.handleUpdateUser(item, permission)}
            />
          )}
        />
        <Modal
          title={`Add people to ${collection.name}`}
          onRequestClose={this.handleAddMemberModalClose}
          isOpen={this.addMemberModalOpen}
        >
          <AddPeopleToCollection
            collection={collection}
            onSubmit={this.handleAddMemberModalClose}
          />
        </Modal>
      </Flex>
    );
  }
}

const GroupsWrap = styled.div`
  margin-bottom: 50px;
`;

export default inject(
  "auth",
  "users",
  "memberships",
  "collectionGroupMemberships",
  "groups",
  "ui"
)(CollectionMembers);
