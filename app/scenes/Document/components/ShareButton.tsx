import { observer } from "mobx-react";
import { GlobeIcon } from "outline-icons";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import Document from "~/models/Document";
import Button from "~/components/Button";
import useMobile from "~/hooks/useMobile";
import useStores from "~/hooks/useStores";
import { shareDocument } from "~/actions/definitions/documents";
import { ActionContextProvider } from "~/hooks/useActionContext";

type Props = {
  /** Document being shared */
  document: Document;
};

function ShareButton({ document }: Props) {
  const { t } = useTranslation();
  const { shares } = useStores();
  const isMobile = useMobile();
  const share = shares.getByDocumentId(document.id);
  const sharedParent = shares.getByDocumentParents(document);
  const domain = share?.domain || sharedParent?.domain;

  const handleClick = useCallback(() => {
    // The action will be executed through ActionButton
  }, []);

  if (isMobile) {
    return null;
  }

  const icon = document.isPubliclyShared ? <GlobeIcon /> : undefined;

  return (
    <ActionContextProvider value={{ activeDocumentId: document.id }}>
      <Button icon={icon} neutral action={shareDocument} onClick={handleClick}>
        {t("Share")} {domain && <>&middot; {domain}</>}
      </Button>
    </ActionContextProvider>
  );
}

export default observer(ShareButton);
