import { observer } from "mobx-react";
import * as React from "react";
import { Trans } from "react-i18next";
import Flex from "~/components/Flex";
import Text from "~/components/Text";
import useStores from "~/hooks/useStores";
import DropToImport from "./DropToImport";
import HelpDisclosure from "./HelpDisclosure";

function ImportOutlineDialog() {
  const { dialogs } = useStores();

  return (
    <Flex column>
      <Text type="secondary">
        <DropToImport
          onSubmit={dialogs.closeAllModals}
          format="outline-markdown"
        >
          <Trans>
            Drag and drop the zip file from Outline's export option, or click to
            upload
          </Trans>
        </DropToImport>
      </Text>
      <HelpDisclosure title={<Trans>How does this work?</Trans>}>
        <Trans
          defaults="You can import a zip file that was previously exported from an Outline installation – collections, documents, and images will be imported. In Outline, open <em>Export</em> in the Settings sidebar and click on <em>Export Data</em>."
          components={{
            em: <strong />,
          }}
        />
      </HelpDisclosure>
    </Flex>
  );
}

export default observer(ImportOutlineDialog);
