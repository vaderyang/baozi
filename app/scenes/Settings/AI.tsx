import { observer } from "mobx-react";
import { SparklesIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TeamPreference } from "@shared/types";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import { InputSelect, Option } from "~/components/InputSelect";
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

  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [loadingModels, setLoadingModels] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);

  // Fetch available models from the backend API
  React.useEffect(() => {
    const fetchModels = async () => {
      setLoadingModels(true);
      setModelsError(null);

      try {
        const response = await fetch("/api/ai.models", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ||
              `Failed to fetch models: ${response.status} ${response.statusText}`
          );
        }

        const data = (await response.json()) as {
          data?: {
            models?: Array<{ id: string }>;
          };
        };

        if (data.data?.models && Array.isArray(data.data.models)) {
          const modelIds = data.data.models
            .map((model) => model.id)
            .filter((id): id is string => !!id);
          setAvailableModels(modelIds);
        } else {
          throw new Error("Invalid response format from models API");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setModelsError(errorMessage);
      } finally {
        setLoadingModels(false);
      }
    };

    void fetchModels();
  }, []);

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

  const modelOptions: Option[] = React.useMemo(() => {
    const options: Option[] = [
      {
        type: "item",
        label: t("Use environment default"),
        value: "",
      },
    ];

    if (availableModels.length > 0) {
      availableModels.forEach((modelId) => {
        options.push({
          type: "item",
          label: modelId,
          value: modelId,
        });
      });
    }

    return options;
  }, [availableModels, t]);

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
          recordings.
        </Trans>
      </Text>
      {modelsError && (
        <Text as="p" type="danger">
          {t("Failed to load models")}: {modelsError}
        </Text>
      )}
      <SettingRow
        label={t("Primary model")}
        name="generateTextModel"
        description={t(
          "Model used for long contexts (>= threshold). Example: qwen-3-coder-480b"
        )}
      >
        <InputSelect
          options={modelOptions}
          value={generateTextModel}
          onChange={(value) => {
            setGenerateTextModel(value);
            void handleSave();
          }}
          label={t("Primary model")}
          hideLabel
          disabled={loadingModels}
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
        <InputSelect
          options={modelOptions}
          value={generateTextFallbackModel}
          onChange={(value) => {
            setGenerateTextFallbackModel(value);
            void handleSave();
          }}
          label={t("Fallback model")}
          hideLabel
          disabled={loadingModels}
        />
      </SettingRow>

      <Heading as="h2">{t("AI Search")}</Heading>
      <Text as="p" type="secondary">
        <Trans>
          Models used for the AI search feature. Fallback model is used when
          primary model fails (rate limits, errors, etc.).
        </Trans>
      </Text>
      <SettingRow
        label={t("Primary model")}
        name="searchModel"
        description={t(
          "Primary model for AI search. Example: qwen3-30b-a3b-instruct"
        )}
      >
        <InputSelect
          options={modelOptions}
          value={searchModel}
          onChange={(value) => {
            setSearchModel(value);
            void handleSave();
          }}
          label={t("Primary model")}
          hideLabel
          disabled={loadingModels}
        />
      </SettingRow>
      <SettingRow
        label={t("Fallback model")}
        name="searchFallbackModel"
        description={t(
          "Fallback model used when primary fails. Example: qwen-3-coder-480b"
        )}
        border={false}
      >
        <InputSelect
          options={modelOptions}
          value={searchFallbackModel}
          onChange={(value) => {
            setSearchFallbackModel(value);
            void handleSave();
          }}
          label={t("Fallback model")}
          hideLabel
          disabled={loadingModels}
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
        <InputSelect
          options={modelOptions}
          value={visionModel}
          onChange={(value) => {
            setVisionModel(value);
            void handleSave();
          }}
          label={t("Vision model")}
          hideLabel
          disabled={loadingModels}
        />
      </SettingRow>
    </Scene>
  );
}

export default observer(AI);
