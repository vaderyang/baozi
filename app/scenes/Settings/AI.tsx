import { observer } from "mobx-react";
import { SparklesIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TeamPreference } from "@shared/types";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import SettingRow from "./components/SettingRow";

function AI() {
  const { t } = useTranslation();
  const team = useCurrentTeam();

  const [contextLengthThreshold, setContextLengthThreshold] = React.useState(
    String(team.getPreference(TeamPreference.AiContextLengthThreshold) ?? 500)
  );
  const [generateTextModel, setGenerateTextModel] = React.useState(
    (team.getPreference(TeamPreference.AiGenerateTextModel) as string) ?? ""
  );
  const [generateTextFallbackModel, setGenerateTextFallbackModel] =
    React.useState(
      (team.getPreference(
        TeamPreference.AiGenerateTextFallbackModel
      ) as string) ?? ""
    );
  const [searchModel, setSearchModel] = React.useState(
    (team.getPreference(TeamPreference.AiSearchModel) as string) ?? ""
  );
  const [searchFallbackModel, setSearchFallbackModel] = React.useState(
    (team.getPreference(TeamPreference.AiSearchFallbackModel) as string) ?? ""
  );
  const [visionModel, setVisionModel] = React.useState(
    (team.getPreference(TeamPreference.AiVisionModel) as string) ?? ""
  );

  const handleSave = React.useCallback(async () => {
    const threshold = parseInt(contextLengthThreshold, 10);
    if (isNaN(threshold) || threshold < 1) {
      toast.error(t("Context length threshold must be a positive number"));
      return;
    }

    await team.save({
      preferences: {
        ...team.preferences,
        [TeamPreference.AiContextLengthThreshold]: threshold,
        [TeamPreference.AiGenerateTextModel]: generateTextModel || undefined,
        [TeamPreference.AiGenerateTextFallbackModel]:
          generateTextFallbackModel || undefined,
        [TeamPreference.AiSearchModel]: searchModel || undefined,
        [TeamPreference.AiSearchFallbackModel]:
          searchFallbackModel || undefined,
        [TeamPreference.AiVisionModel]: visionModel || undefined,
      },
    });
    toast.success(t("AI settings saved"));
  }, [
    team,
    contextLengthThreshold,
    generateTextModel,
    generateTextFallbackModel,
    searchModel,
    searchFallbackModel,
    visionModel,
    t,
  ]);

  return (
    <Scene title={t("AI")} icon={<SparklesIcon />}>
      <Heading>{t("AI")}</Heading>
      <Text as="p" type="secondary">
        <Trans>
          Configure AI model settings for text generation and search. Models are
          automatically selected based on context length to optimize for quality
          and performance.
        </Trans>
      </Text>

      <Heading as="h2">{t("Model Switching")}</Heading>
      <SettingRow
        label={t("Context length threshold")}
        name="contextLengthThreshold"
        description={t(
          "Character count threshold for switching between models. Contexts shorter than this use the fallback model, longer contexts use the primary model."
        )}
      >
        <Input
          value={contextLengthThreshold}
          onChange={(e) => setContextLengthThreshold(e.target.value)}
          onBlur={handleSave}
          placeholder="500"
        />
      </SettingRow>

      <Heading as="h2">{t("Text Generation")}</Heading>
      <Text as="p" type="secondary">
        <Trans>
          Models used for the "Generate Text" feature and auto-summary in
          recordings. Leave empty to use environment defaults.
        </Trans>
      </Text>
      <SettingRow
        label={t("Primary model")}
        name="generateTextModel"
        description={t(
          "Model used for long contexts (>= threshold). Example: qwen-3-coder-480b"
        )}
      >
        <Input
          value={generateTextModel}
          onChange={(e) => setGenerateTextModel(e.target.value)}
          onBlur={handleSave}
          placeholder={t("From environment: LLM_MODEL_NAME")}
        />
      </SettingRow>
      <SettingRow
        label={t("Fallback model")}
        name="generateTextFallbackModel"
        description={t(
          "Model used for short contexts (< threshold). Example: qwen3-30b-a3b-instruct"
        )}
        border={false}
      >
        <Input
          value={generateTextFallbackModel}
          onChange={(e) => setGenerateTextFallbackModel(e.target.value)}
          onBlur={handleSave}
          placeholder={t("From environment: LLM_MODEL_NAME_AI_SEARCH")}
        />
      </SettingRow>

      <Heading as="h2">{t("AI Search")}</Heading>
      <Text as="p" type="secondary">
        <Trans>
          Models used for the AI search feature. Leave empty to use environment
          defaults.
        </Trans>
      </Text>
      <SettingRow
        label={t("Primary model")}
        name="searchModel"
        description={t(
          "Model used for long contexts (>= threshold). Example: qwen3-30b-a3b-instruct"
        )}
      >
        <Input
          value={searchModel}
          onChange={(e) => setSearchModel(e.target.value)}
          onBlur={handleSave}
          placeholder={t("From environment: LLM_MODEL_NAME_AI_SEARCH")}
        />
      </SettingRow>
      <SettingRow
        label={t("Fallback model")}
        name="searchFallbackModel"
        description={t(
          "Model used for short contexts (< threshold). Example: qwen-3-coder-480b"
        )}
        border={false}
      >
        <Input
          value={searchFallbackModel}
          onChange={(e) => setSearchFallbackModel(e.target.value)}
          onBlur={handleSave}
          placeholder={t("From environment: LLM_MODEL_NAME")}
        />
      </SettingRow>

      <Heading as="h2">{t("Vision")}</Heading>
      <SettingRow
        label={t("Vision model")}
        name="visionModel"
        description={t(
          "Model used for image analysis and vision tasks. Example: grok-4-fast-non-reasoning"
        )}
        border={false}
      >
        <Input
          value={visionModel}
          onChange={(e) => setVisionModel(e.target.value)}
          onBlur={handleSave}
          placeholder={t("From environment: LLM_MODEL_NAME_VISION")}
        />
      </SettingRow>
    </Scene>
  );
}

export default observer(AI);
