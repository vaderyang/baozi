import { observer } from "mobx-react";
import { NewDocumentIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import styled from "styled-components";
import Collection from "~/models/Collection";
import CollectionPermissions from "~/scenes/CollectionPermissions";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import HelpText from "~/components/HelpText";
import Modal from "~/components/Modal";
import useBoolean from "~/hooks/useBoolean";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import useStores from "~/hooks/useStores";
import { newDocumentPath } from "~/utils/routeHelpers";

type Props = {
  collection: Collection;
};

function EmptyCollection({ collection }: Props) {
  const { policies } = useStores();
  const { t } = useTranslation();
  const team = useCurrentTeam();
  const can = policies.abilities(team.id);
  const collectionName = collection ? collection.name : "";

  const [
    permissionsModalOpen,
    handlePermissionsModalOpen,
    handlePermissionsModalClose,
  ] = useBoolean();

  return (
    <Centered column>
      <HelpText>
        <Trans
          defaults="<em>{{ collectionName }}</em> doesn’t contain any
                    documents yet."
          values={{
            collectionName,
          }}
          components={{
            em: <strong />,
          }}
        />
        <br />
        {can.createDocument && (
          <Trans>Get started by creating a new one!</Trans>
        )}
      </HelpText>
      <Empty>
        {can.createDocument && (
          <Link to={newDocumentPath(collection.id)}>
            <Button icon={<NewDocumentIcon color="currentColor" />}>
              {t("Create a document")}
            </Button>
          </Link>
        )}
        &nbsp;&nbsp;
        <Button onClick={handlePermissionsModalOpen} neutral>
          {t("Manage permissions")}…
        </Button>
      </Empty>
      <Modal
        title={t("Collection permissions")}
        onRequestClose={handlePermissionsModalClose}
        isOpen={permissionsModalOpen}
      >
        <CollectionPermissions collection={collection} />
      </Modal>
    </Centered>
  );
}

const Centered = styled(Flex)`
  text-align: center;
  margin: 40vh auto 0;
  max-width: 380px;
  transform: translateY(-50%);
`;

const Empty = styled(Flex)`
  justify-content: center;
  margin: 10px 0;
`;

export default observer(EmptyCollection);
