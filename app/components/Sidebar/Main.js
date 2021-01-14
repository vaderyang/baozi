// @flow
import { observable } from "mobx";
import { observer, inject } from "mobx-react";
import {
  ArchiveIcon,
  HomeIcon,
  EditIcon,
  SearchIcon,
  StarredIcon,
  ShapesIcon,
  TrashIcon,
  PlusIcon,
} from "outline-icons";
import * as React from "react";
import { withTranslation, type TFunction } from "react-i18next";
import styled from "styled-components";

import AuthStore from "stores/AuthStore";
import DocumentsStore from "stores/DocumentsStore";
import PoliciesStore from "stores/PoliciesStore";
import CollectionNew from "scenes/CollectionNew";
import Invite from "scenes/Invite";
import Flex from "components/Flex";
import Modal from "components/Modal";
import Scrollable from "components/Scrollable";
import Sidebar from "./Sidebar";
import Bubble from "./components/Bubble";
import Collections from "./components/Collections";
import HeaderBlock from "./components/HeaderBlock";
import Section from "./components/Section";
import SidebarLink from "./components/SidebarLink";
import AccountMenu from "menus/AccountMenu";

type Props = {
  auth: AuthStore,
  documents: DocumentsStore,
  policies: PoliciesStore,
  t: TFunction,
};

@observer
class MainSidebar extends React.Component<Props> {
  @observable inviteModalOpen = false;
  @observable createCollectionModalOpen = false;

  componentDidMount() {
    this.props.documents.fetchDrafts();
    this.props.documents.fetchTemplates();
  }

  handleCreateCollectionModalOpen = (ev: SyntheticEvent<>) => {
    ev.preventDefault();
    this.createCollectionModalOpen = true;
  };

  handleCreateCollectionModalClose = (ev: SyntheticEvent<>) => {
    this.createCollectionModalOpen = false;
  };

  handleInviteModalOpen = (ev: SyntheticEvent<>) => {
    ev.preventDefault();
    this.inviteModalOpen = true;
  };

  handleInviteModalClose = () => {
    this.inviteModalOpen = false;
  };

  render() {
    const { auth, documents, policies, t } = this.props;
    const { user, team } = auth;
    if (!user || !team) return null;

    const can = policies.abilities(team.id);

    return (
      <Sidebar>
        <AccountMenu>
          {(props) => (
            <HeaderBlock
              {...props}
              subheading={user.name}
              teamName={team.name}
              logoUrl={team.avatarUrl}
              showDisclosure
            />
          )}
        </AccountMenu>
        <Flex auto column>
          <Scrollable shadow>
            <Section>
              <SidebarLink
                to="/home"
                icon={<HomeIcon color="currentColor" />}
                exact={false}
                label={t("Home")}
              />
              <SidebarLink
                to={{
                  pathname: "/search",
                  state: { fromMenu: true },
                }}
                icon={<SearchIcon color="currentColor" />}
                label={t("Search")}
                exact={false}
              />
              <SidebarLink
                to="/starred"
                icon={<StarredIcon color="currentColor" />}
                exact={false}
                label={t("Starred")}
              />
              <SidebarLink
                to="/templates"
                icon={<ShapesIcon color="currentColor" />}
                exact={false}
                label={t("Templates")}
                active={
                  documents.active ? documents.active.template : undefined
                }
              />
              <SidebarLink
                to="/drafts"
                icon={<EditIcon color="currentColor" />}
                label={
                  <Drafts align="center">
                    {t("Drafts")}
                    {documents.totalDrafts > 0 && (
                      <Bubble count={documents.totalDrafts} />
                    )}
                  </Drafts>
                }
                active={
                  documents.active
                    ? !documents.active.publishedAt &&
                      !documents.active.isDeleted &&
                      !documents.active.isTemplate
                    : undefined
                }
              />
            </Section>
            <Section>
              <Collections
                onCreateCollection={this.handleCreateCollectionModalOpen}
              />
            </Section>
            <Section>
              <SidebarLink
                to="/archive"
                icon={<ArchiveIcon color="currentColor" />}
                exact={false}
                label={t("Archive")}
                active={
                  documents.active
                    ? documents.active.isArchived && !documents.active.isDeleted
                    : undefined
                }
              />
              <SidebarLink
                to="/trash"
                icon={<TrashIcon color="currentColor" />}
                exact={false}
                label={t("Trash")}
                active={
                  documents.active ? documents.active.isDeleted : undefined
                }
              />
              {can.invite && (
                <SidebarLink
                  to="/settings/people"
                  onClick={this.handleInviteModalOpen}
                  icon={<PlusIcon color="currentColor" />}
                  label={t("Invite people…")}
                />
              )}
            </Section>
          </Scrollable>
        </Flex>
        <Modal
          title={t("Invite people")}
          onRequestClose={this.handleInviteModalClose}
          isOpen={this.inviteModalOpen}
        >
          <Invite onSubmit={this.handleInviteModalClose} />
        </Modal>
        <Modal
          title={t("Create a collection")}
          onRequestClose={this.handleCreateCollectionModalClose}
          isOpen={this.createCollectionModalOpen}
        >
          <CollectionNew onSubmit={this.handleCreateCollectionModalClose} />
        </Modal>
      </Sidebar>
    );
  }
}

const Drafts = styled(Flex)`
  height: 24px;
`;

export default withTranslation()<MainSidebar>(
  inject("documents", "policies", "auth")(MainSidebar)
);
