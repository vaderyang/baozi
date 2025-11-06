import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import Text from "~/components/Text";

interface AudioInboxEmptyProps {
  onNewRecording: () => void;
}

const AudioInboxEmpty = observer(function _AudioInboxEmpty({
  onNewRecording,
}: AudioInboxEmptyProps) {
  const { t } = useTranslation();

  return (
    <Container>
      <EmptyIcon>🎙️</EmptyIcon>
      <Heading>{t("No recordings yet")}</Heading>
      <Text type="secondary">
        {t(
          "Start recording audio to capture your thoughts, meetings, and ideas. All recordings will appear here."
        )}
      </Text>
      <Button onClick={onNewRecording} icon={<span>🎙️</span>}>
        {t("Start Recording")}
      </Button>
    </Container>
  );
});

const Container = styled(Flex)`
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 32px;
  text-align: center;
  gap: 16px;
`;

const EmptyIcon = styled.div`
  font-size: 64px;
  opacity: 0.5;
  margin-bottom: 16px;
`;

export default AudioInboxEmpty;
