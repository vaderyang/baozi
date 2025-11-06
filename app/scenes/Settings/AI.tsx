import { observer } from "mobx-react";
import { SparklesIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TeamPreference, TeamPreferences } from "@shared/types";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import { InputSelect, Option } from "~/components/InputSelect";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import { client } from "~/utils/ApiClient";
import SettingRow from "./components/SettingRow";

function AI() {
  const { t } = useTranslation();
  const team = useCurrentTeam();

  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [loadingModels, setLoadingModels] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);

  // Read values directly from team preferences (MobX will handle reactivity)
  const contextLengthThreshold = String(
    team.getPreference(TeamPreference.AiContextLengthThreshold) ?? 500
  );
  const generateTextModel =
    (team.getPreference(TeamPreference.AiGenerateTextModel) as string) ||
    "__default__";
  const generateTextFallbackModel =
    (team.getPreference(
      TeamPreference.AiGenerateTextFallbackModel
    ) as string) || "__default__";
  const searchModel =
    (team.getPreference(TeamPreference.AiSearchModel) as string) ||
    "__default__";
  const searchFallbackModel =
    (team.getPreference(TeamPreference.AiSearchFallbackModel) as string) ||
    "__default__";
  const visionModel =
    (team.getPreference(TeamPreference.AiVisionModel) as string) ||
    "__default__";
  const transcriptionEndpoint =
    (team.getPreference(TeamPreference.TranscriptionEndpoint) as string) || "";

  // Fetch available models from the backend API
  React.useEffect(() => {
    let cancelled = false;

    const fetchModels = async () => {
      setLoadingModels(true);
      setModelsError(null);

      try {
        const data = await client.post("/ai.models");

        if (cancelled) {
          return;
        }

        if (data?.models && Array.isArray(data.models)) {
          const modelIds = data.models
            .map((model: { id: string }) => model.id)
            .filter((id: string | undefined): id is string => !!id);
          setAvailableModels(modelIds);
        } else {
          throw new Error("Invalid response format from models API");
        }
      } catch (error) {
        if (!cancelled) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          setModelsError(errorMessage);
        }
      } finally {
        if (!cancelled) {
          setLoadingModels(false);
        }
      }
    };

    void fetchModels();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = React.useCallback(
    async (updates: Partial<TeamPreferences>) => {
      // Convert __default__ back to undefined for storage
      // For string fields, empty string means "use default" so convert to undefined
      const cleanValue = (key: TeamPreference, val: unknown) => {
        if (val === "__default__") {
          return undefined;
        }
        // For string preferences, empty string should be saved as undefined
        if (typeof val === "string" && val.trim() === "") {
          return undefined;
        }
        return val;
      };

      const cleanedUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        cleanedUpdates[key] = cleanValue(key as TeamPreference, value);
      }

      await team.save({
        preferences: {
          ...team.preferences,
          ...cleanedUpdates,
        },
      });
      toast.success(t("AI settings saved"));
    },
    [team, t]
  );

  const modelOptions: Option[] = React.useMemo(() => {
    const options: Option[] = [
      {
        type: "item",
        label: t("Use environment default"),
        value: "__default__",
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
    } else if (modelsError) {
      // If API failed, add some common model names as suggestions
      const commonModels = [
        "qwen-3-coder-480b",
        "qwen3-30b-a3b-instruct",
        "grok-4-fast-non-reasoning",
        "gpt-4",
        "gpt-3.5-turbo",
        "claude-3-opus",
        "claude-3-sonnet",
      ];
      commonModels.forEach((modelId) => {
        options.push({
          type: "item",
          label: modelId,
          value: modelId,
        });
      });
    }

    return options;
  }, [availableModels, modelsError, t]);

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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const threshold = parseInt(e.target.value, 10);
            if (!isNaN(threshold) && threshold >= 1) {
              team.setPreference(
                TeamPreference.AiContextLengthThreshold,
                threshold
              );
            }
          }}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            const threshold = parseInt(e.target.value, 10);
            if (isNaN(threshold) || threshold < 1) {
              toast.error(
                t("Context length threshold must be a positive number")
              );
              return;
            }
            void handleSave({
              [TeamPreference.AiContextLengthThreshold]: threshold,
            });
          }}
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
        <Text as="p" type="secondary">
          {t("Could not load models from API")}: {modelsError}
          <br />
          {t("You can still manually enter model names below.")}
        </Text>
      )}
      {loadingModels && (
        <Text as="p" type="secondary">
          {t("Loading available models...")}
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
            void handleSave({
              [TeamPreference.AiGenerateTextModel]: value,
            });
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
            void handleSave({
              [TeamPreference.AiGenerateTextFallbackModel]: value,
            });
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
            void handleSave({
              [TeamPreference.AiSearchModel]: value,
            });
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
            void handleSave({
              [TeamPreference.AiSearchFallbackModel]: value,
            });
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
      >
        <InputSelect
          options={modelOptions}
          value={visionModel}
          onChange={(value) => {
            void handleSave({
              [TeamPreference.AiVisionModel]: value,
            });
          }}
          label={t("Vision model")}
          hideLabel
          disabled={loadingModels}
        />
      </SettingRow>

      <Heading as="h2">{t("Transcription")}</Heading>
      <SettingRow
        label={t("Transcription endpoint")}
        name="transcriptionEndpoint"
        description={t(
          "Audio transcription service endpoint URL. Leave empty to use environment default."
        )}
        border={false}
      >
        <Input
          value={transcriptionEndpoint}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            team.setPreference(
              TeamPreference.TranscriptionEndpoint,
              e.target.value
            );
          }}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            void handleSave({
              [TeamPreference.TranscriptionEndpoint]: e.target.value,
            });
          }}
          placeholder="http://v.netis.com.cn:13000/transcribe"
        />
      </SettingRow>
    </Scene>
  );
}

export default observer(AI);
