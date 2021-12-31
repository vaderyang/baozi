import { observer } from "mobx-react";
import { MoreIcon, PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Collection from "~/models/Collection";
import { Action, Separator } from "~/components/Actions";
import Button from "~/components/Button";
import InputSearchPage from "~/components/InputSearchPage";
import Tooltip from "~/components/Tooltip";
import useStores from "~/hooks/useStores";
import CollectionMenu from "~/menus/CollectionMenu";
import { newDocumentPath } from "~/utils/routeHelpers";

type Props = {
  collection: Collection;
};

function Actions({ collection }: Props) {
  const { t } = useTranslation();
  const { policies } = useStores();
  const can = policies.abilities(collection.id);

  return (
    <>
      <Action>
        <InputSearchPage
          source="collection"
          placeholder={`${t("Search in collection")}…`}
          label={`${t("Search in collection")}…`}
          collectionId={collection.id}
        />
      </Action>
      {can.update && (
        <>
          <Action>
            <Tooltip
              tooltip={t("New document")}
              shortcut="n"
              delay={500}
              placement="bottom"
            >
              <Button
                as={Link}
                to={collection ? newDocumentPath(collection.id) : ""}
                disabled={!collection}
                icon={<PlusIcon />}
              >
                {t("New doc")}
              </Button>
            </Tooltip>
          </Action>
          <Separator />
        </>
      )}
      <Action>
        <CollectionMenu
          collection={collection}
          placement="bottom-end"
          label={(props) => (
            <Button
              icon={<MoreIcon />}
              {...props}
              borderOnHover
              neutral
              small
            />
          )}
        />
      </Action>
    </>
  );
}

export default observer(Actions);
