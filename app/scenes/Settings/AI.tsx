import { observer } from "mobx-react";
import { SparklesIcon, RestoreIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TeamPreference, TeamPreferences } from "@shared/types";
import Button from "~/components/Button";
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
  const [defaultLlmApiBaseUrl, setDefaultLlmApiBaseUrl] =
    React.useState<string>("");
  const [currentApiBaseUrlValue, setCurrentApiBaseUrlValue] =
    React.useState<string>("");
  const [currentApiKeyValue, setCurrentApiKeyValue] =
    React.useState<string>("");

  // Read values directly from team preferences (MobX will handle reactivity)
  const primaryModel =
    (team.getPreference(TeamPreference.AiGenerateTextModel) as string) ||
    (team.getPreference(TeamPreference.AiSearchModel) as string) ||
    "__default__";
  const taskModel =
    (team.getPreference(TeamPreference.AiTaskModel) as string) || "__default__";
  const fallbackModel =
    (team.getPreference(TeamPreference.AiFallbackModel) as string) ||
    "__default__";
  const visionModel =
    (team.getPreference(TeamPreference.AiVisionModel) as string) ||
    "__default__";
  const transcriptionEndpoint =
    (team.getPreference(TeamPreference.TranscriptionEndpoint) as string) || "";

  // Get the team preference values (may be undefined if not set)
  const llmApiBaseUrl = team.getPreference(TeamPreference.LLM_API_BASE_URL) as
    | string
    | undefined;
  const llmApiKey = team.getPreference(TeamPreference.LLM_API_KEY) as
    | string
    | undefined;

  // Initialize and sync input values with team preferences
  React.useEffect(() => {
    // Always sync with team preferences on mount or when they change
    setCurrentApiBaseUrlValue(llmApiBaseUrl || defaultLlmApiBaseUrl || "");
  }, [llmApiBaseUrl, defaultLlmApiBaseUrl]);

  React.useEffect(() => {
    setCurrentApiKeyValue(llmApiKey || "");
  }, [llmApiKey]);

  // Save handler for team preferences
  const handleSave = React.useCallback(
    async (updates: Partial<TeamPreferences>) => {
      // Convert __default__ back to undefined for storage
      // For string fields, empty string means "use default" so convert to undefined
      const cleanValue = (key: TeamPreference, val: unknown) => {
        if (val === "__default__") {
          return undefined;
        }
        // For string preferences, empty string should be saved as undefined
        // This allows the system to fall back to environment defaults
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

  // Fetch available models from the backend API
  const fetchModels = React.useCallback(async () => {
    setLoadingModels(true);
    setModelsError(null);

    try {
      const response = await client.post("/ai.models");

      const modelsResponse = response?.data?.models;
      if (Array.isArray(modelsResponse)) {
        const modelIds = modelsResponse
          .map((model: { id?: string | null }) => model.id)
          .filter((id: string | undefined | null): id is string => !!id)
          .sort();
        setAvailableModels(modelIds);

        // Show success message
        toast.success(
          t("Successfully fetched {{count}} models", { count: modelIds.length })
        );
      } else {
        throw new Error("Invalid response format from models API");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setModelsError(errorMessage);

      // Show error toast with helpful message
      toast.error(
        t("Failed to fetch models: {{error}}", { error: errorMessage })
      );
    } finally {
      setLoadingModels(false);
    }
  }, [t]);

  // Save current input values and then fetch models
  const handleRefreshModels = React.useCallback(async () => {
    // First save any pending changes to the server
    await handleSave({
      [TeamPreference.LLM_API_KEY]: currentApiKeyValue,
      [TeamPreference.LLM_API_BASE_URL]: currentApiBaseUrlValue,
    });

    // Then fetch models with the new credentials
    await fetchModels();
  }, [currentApiKeyValue, currentApiBaseUrlValue, handleSave, fetchModels]);

  // Fetch models on mount
  React.useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  // Fetch default LLM API base URL from the backend
  React.useEffect(() => {
    let cancelled = false;

    const fetchDefaultConfig = async () => {
      try {
        const response = await client.post("/ai.defaultConfig");

        if (cancelled) {
          return;
        }

        if (response?.data?.defaultLlmApiBaseUrl) {
          setDefaultLlmApiBaseUrl(response.data.defaultLlmApiBaseUrl);
        }
      } catch {
        // Silently fail - default config is optional
      }
    };

    void fetchDefaultConfig();

    return () => {
      cancelled = true;
    };
  }, []);

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
        "zai-glm-4.6",
        "GLM-4.6",
        "zai-org/GLM-4.5-Air",
        "qwen3-30b-a3b-instruct",
        "qwen-3-coder-480b",
        "grok-4-fast-non-reasoning",
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
          Configure AI model settings using a three-tier system: Primary model
          for heavy-duty tasks, Task model for lightweight operations, and
          Fallback model as a universal backup.
        </Trans>
      </Text>

      <Heading as="h2">{t("Primary Model")}</Heading>
      <Text as="p" type="secondary">
        <Trans>
          Used for heavy-duty AI tasks: AI Summary Generation, Generate Text, AI
          Ask, and Search (AI Answer). Default: zai-glm-4.6
        </Trans>
      </Text>
      <SettingRow
        label={t("Primary model")}
        name="primaryModel"
        description={t(
          "High-quality model for complex AI operations. Example: zai-glm-4.6"
        )}
        border={false}
      >
        <InputSelect
          options={modelOptions}
          value={primaryModel}
          onChange={(value) => {
            // Update both AiGenerateTextModel and AiSearchModel for consistency
            void handleSave({
              [TeamPreference.AiGenerateTextModel]: value,
              [TeamPreference.AiSearchModel]: value,
            });
          }}
          label={t("Primary model")}
          hideLabel
          disabled={loadingModels}
        />
      </SettingRow>

      <Heading as="h2">{t("Task Model")}</Heading>
      <Text as="p" type="secondary">
        <Trans>
          Used for lightweight, frequent operations: title generation,
          transcript time-segment summaries, and AI Suggestions. Default:
          qwen3-30b-a3b-instruct
        </Trans>
      </Text>
      <SettingRow
        label={t("Task model")}
        name="taskModel"
        description={t(
          "Fast, efficient model for quick AI tasks. Example: qwen3-30b-a3b-instruct"
        )}
        border={false}
      >
        <InputSelect
          options={modelOptions}
          value={taskModel}
          onChange={(value) => {
            void handleSave({
              [TeamPreference.AiTaskModel]: value,
            });
          }}
          label={t("Task model")}
          hideLabel
          disabled={loadingModels}
        />
      </SettingRow>

      <Heading as="h2">{t("Fallback Model")}</Heading>
      <Text as="p" type="secondary">
        <Trans>
          Universal fallback used when either Primary or Task model fails due to
          rate limits, errors, or service unavailability. Default: GLM-4.6
        </Trans>
      </Text>
      <SettingRow
        label={t("Fallback model")}
        name="fallbackModel"
        description={t(
          "Reliable backup model for error recovery. Example: GLM-4.6"
        )}
        border={false}
      >
        <InputSelect
          options={modelOptions}
          value={fallbackModel}
          onChange={(value) => {
            void handleSave({
              [TeamPreference.AiFallbackModel]: value,
            });
          }}
          label={t("Fallback model")}
          hideLabel
          disabled={loadingModels}
        />
      </SettingRow>

      <Heading as="h2">{t("Vision")}</Heading>
      <Text as="p" type="secondary">
        <Trans>Specialized model for image analysis and vision tasks.</Trans>
      </Text>
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

      <Heading as="h2">{t("LLM API Configuration")}</Heading>
      <Text as="p" type="secondary">
        <Trans>
          Configure your LLM API credentials. After setting or updating these
          values, use the "Refresh Models" button to verify the connection and
          load available models.
        </Trans>
      </Text>

      <SettingRow
        label={t("LLM API key")}
        name="llmApiKey"
        description={t(
          "API key for LLM API requests. Clear to use environment default."
        )}
      >
        <Input
          type="password"
          value={currentApiKeyValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setCurrentApiKeyValue(e.target.value);
          }}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            void handleSave({
              [TeamPreference.LLM_API_KEY]: e.target.value,
            });
          }}
          placeholder="sk-..."
        />
      </SettingRow>
      <SettingRow
        label={t("LLM API base URL")}
        name="llmApiBaseUrl"
        description={t(
          "Base URL for LLM API requests. Clear to use environment default."
        )}
      >
        <Input
          value={currentApiBaseUrlValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setCurrentApiBaseUrlValue(e.target.value);
          }}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            void handleSave({
              [TeamPreference.LLM_API_BASE_URL]: e.target.value,
            });
          }}
          placeholder={defaultLlmApiBaseUrl || "https://api.openai.com/v1"}
        />
      </SettingRow>

      <SettingRow
        label={t("Model list")}
        name="modelListRefresh"
        description={t(
          "Fetch the list of available models from your LLM API to verify your credentials are correct."
        )}
        border={false}
      >
        <Button
          type="button"
          onClick={handleRefreshModels}
          disabled={loadingModels}
          icon={<RestoreIcon />}
          neutral
        >
          {loadingModels ? t("Fetching...") : t("Refresh Models")}
        </Button>
        {!loadingModels && availableModels.length > 0 && !modelsError && (
          <Text as="span" type="secondary" style={{ marginLeft: "12px" }}>
            ✓{" "}
            {t("{{count}} models available", { count: availableModels.length })}
          </Text>
        )}
        {!loadingModels && modelsError && (
          <Text as="span" type="danger" style={{ marginLeft: "12px" }}>
            ✗ {t("Failed to fetch models")}
          </Text>
        )}
      </SettingRow>
    </Scene>
  );
}

export default observer(AI);
