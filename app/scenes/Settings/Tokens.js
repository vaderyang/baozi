// @flow
import { observer } from "mobx-react";
import { CodeIcon } from "outline-icons";
import * as React from "react";
import { useTranslation, Trans } from "react-i18next";
import APITokenNew from "scenes/APITokenNew";
import { Action } from "components/Actions";
import Button from "components/Button";
import Heading from "components/Heading";
import HelpText from "components/HelpText";
import Modal from "components/Modal";
import PaginatedList from "components/PaginatedList";
import Scene from "components/Scene";
import Subheading from "components/Subheading";
import TokenListItem from "./components/TokenListItem";
import useBoolean from "hooks/useBoolean";
import useCurrentTeam from "hooks/useCurrentTeam";
import useStores from "hooks/useStores";

function Tokens() {
  const team = useCurrentTeam();
  const { t } = useTranslation();
  const { apiKeys, policies } = useStores();
  const [newModalOpen, handleNewModalOpen, handleNewModalClose] = useBoolean();
  const can = policies.abilities(team.id);

  return (
    <Scene
      title={t("API Tokens")}
      icon={<CodeIcon color="currentColor" />}
      actions={
        <>
          {can.createApiKey && (
            <Action>
              <Button
                type="submit"
                value={`${t("New token")}…`}
                onClick={handleNewModalOpen}
              />
            </Action>
          )}
        </>
      }
    >
      <Heading>{t("API Tokens")}</Heading>
      <HelpText>
        <Trans
          defaults="You can create an unlimited amount of personal tokens to authenticate
          with the API. Tokens have the same permissions as your user account.
          For more details see the <em>developer documentation</em>."
          components={{
            em: (
              <a href="https://www.getoutline.com/developers" target="_blank" />
            ),
          }}
        />
      </HelpText>

      <PaginatedList
        fetch={apiKeys.fetchPage}
        items={apiKeys.orderedData}
        heading={<Subheading sticky>{t("Tokens")}</Subheading>}
        renderItem={(token) => (
          <TokenListItem key={token.id} token={token} onDelete={token.delete} />
        )}
      />

      <Modal
        title={t("Create a token")}
        onRequestClose={handleNewModalClose}
        isOpen={newModalOpen}
      >
        <APITokenNew onSubmit={handleNewModalClose} />
      </Modal>
    </Scene>
  );
}

export default observer(Tokens);
