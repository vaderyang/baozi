import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation, Trans } from "react-i18next";
import Group from "~/models/Group";
import GroupMembers from "~/scenes/GroupMembers";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Input from "~/components/Input";
import Modal from "~/components/Modal";
import Text from "~/components/Text";
import useStores from "~/hooks/useStores";
import useToasts from "~/hooks/useToasts";

type Props = {
  onSubmit: () => void;
};

function GroupNew({ onSubmit }: Props) {
  const { groups } = useStores();
  const { t } = useTranslation();
  const { showToast } = useToasts();
  const [name, setName] = React.useState<string | undefined>();
  const [isSaving, setIsSaving] = React.useState(false);
  const [group, setGroup] = React.useState();

  const handleSubmit = async (ev: React.SyntheticEvent) => {
    ev.preventDefault();
    setIsSaving(true);

    const group = new Group(
      {
        name,
      },
      groups
    );

    try {
      setGroup(await group.save());
    } catch (err) {
      showToast(err.message, {
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleNameChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    setName(ev.target.value);
  };

  return (
    <>
      <form onSubmit={handleSubmit}>
        <Text type="secondary">
          <Trans>
            Groups are for organizing your team. They work best when centered
            around a function or a responsibility — Support or Engineering for
            example.
          </Trans>
        </Text>
        <Flex>
          <Input
            type="text"
            label="Name"
            onChange={handleNameChange}
            value={name}
            required
            autoFocus
            flex
          />
        </Flex>
        <Text type="secondary">
          <Trans>You’ll be able to add people to the group next.</Trans>
        </Text>

        <Button type="submit" disabled={isSaving || !name}>
          {isSaving ? `${t("Creating")}…` : t("Continue")}
        </Button>
      </form>
      <Modal
        title={t("Group members")}
        onRequestClose={onSubmit}
        isOpen={!!group}
      >
        {group && <GroupMembers group={group} />}
      </Modal>
    </>
  );
}

export default observer(GroupNew);
