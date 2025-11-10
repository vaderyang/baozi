import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { CheckmarkIcon, WarningIcon, CrossIcon } from "outline-icons";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import Button from "~/components/Button";
import { client } from "~/utils/ApiClient";

interface ServiceHealth {
  status: "healthy" | "unhealthy" | "unknown";
  responseTime?: number;
  error?: string;
  details?: Record<string, unknown>;
}

type ModelRole =
  | "primary"
  | "task"
  | "fallback"
  | "search"
  | "sensitive"
  | "vision";

interface ModelHealth extends ServiceHealth {
  modelName: string;
  roles?: ModelRole[];
  source?: "team" | "environment";
}

interface HealthData {
  overall: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    database: ServiceHealth;
    llmModels: ModelHealth[];
    asr: ServiceHealth;
  };
}

function Health() {
  const { t } = useTranslation();
  const [healthData, setHealthData] = React.useState<HealthData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const checkHealth = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await client.post("/health.check");
      setHealthData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check health");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckmarkIcon />;
      case "unhealthy":
        return <CrossIcon />;
      case "unknown":
        return <WarningIcon />;
      default:
        return <WarningIcon />;
    }
  };

  const getOverallStatusText = (status: string) => {
    switch (status) {
      case "healthy":
        return t("All systems operational");
      case "degraded":
        return t("Some services degraded");
      case "unhealthy":
        return t("System issues detected");
      default:
        return t("Unknown");
    }
  };

  const formatModelRoles = React.useCallback(
    (roles?: ModelRole[]) => {
      if (!roles || roles.length === 0) {
        return "";
      }

      const roleLabels: Record<ModelRole, string> = {
        primary: t("Primary model"),
        task: t("Task model"),
        fallback: t("Fallback model"),
        search: t("Search model"),
        sensitive: t("Sensitive model"),
        vision: t("Vision model"),
      };

      return roles.map((role) => roleLabels[role] ?? role).join(", ");
    },
    [t]
  );

  const getSourceLabel = React.useCallback(
    (source?: "team" | "environment") => {
      if (source === "team") {
        return t("Team settings");
      }
      if (source === "environment") {
        return t("Environment default");
      }
      return "";
    },
    [t]
  );

  return (
    <Scene textTitle={t("System Health")}>
      <Container>
        <Header>
          <Flex align="center" justify="space-between">
            <div>
              <Title>{t("System Health")}</Title>
              <Subtitle type="secondary">
                {t("Monitor the status of backend services")}
              </Subtitle>
            </div>
            <Button onClick={checkHealth} disabled={loading}>
              {loading ? t("Checking...") : t("Refresh")}
            </Button>
          </Flex>
        </Header>

        {error && (
          <ErrorBox>
            <CrossIcon />
            <Text>{error}</Text>
          </ErrorBox>
        )}

        {healthData && (
          <>
            <OverallStatus $status={healthData.overall}>
              <Flex align="center" gap={12}>
                {getStatusIcon(healthData.overall)}
                <div>
                  <StatusTitle>
                    {getOverallStatusText(healthData.overall)}
                  </StatusTitle>
                  <StatusTime type="tertiary" size="small">
                    {t("Last checked")}:{" "}
                    {new Date(healthData.timestamp).toLocaleString()}
                  </StatusTime>
                </div>
              </Flex>
            </OverallStatus>

            <ServicesGrid>
              <ServiceCard>
                <ServiceHeader>
                  <Flex align="center" gap={8}>
                    {getStatusIcon(healthData.services.database.status)}
                    <ServiceName>{t("Database")}</ServiceName>
                  </Flex>
                  <StatusBadge $status={healthData.services.database.status}>
                    {healthData.services.database.status}
                  </StatusBadge>
                </ServiceHeader>

                {healthData.services.database.responseTime !== undefined && (
                  <ServiceDetail>
                    <DetailLabel>{t("Response Time")}:</DetailLabel>
                    <DetailValue>
                      {healthData.services.database.responseTime}ms
                    </DetailValue>
                  </ServiceDetail>
                )}

                {healthData.services.database.details && (
                  <>
                    <ServiceDetail>
                      <DetailLabel>{t("Users")}:</DetailLabel>
                      <DetailValue>
                        {healthData.services.database.details.userCount}
                      </DetailValue>
                    </ServiceDetail>
                    <ServiceDetail>
                      <DetailLabel>{t("Documents")}:</DetailLabel>
                      <DetailValue>
                        {healthData.services.database.details.documentCount}
                      </DetailValue>
                    </ServiceDetail>
                  </>
                )}

                {healthData.services.database.error && (
                  <ErrorMessage>
                    {healthData.services.database.error}
                  </ErrorMessage>
                )}
              </ServiceCard>

              {healthData.services.llmModels.map((model, index) => {
                const roleLabel = formatModelRoles(model.roles);
                const sourceLabel = getSourceLabel(model.source);

                return (
                  <ServiceCard key={`${model.modelName}-${index}`}>
                    <ServiceHeader>
                      <Flex align="center" gap={8}>
                        {getStatusIcon(model.status)}
                        <ServiceName>
                          {t("LLM")}
                          {roleLabel ? ` (${roleLabel})` : ""}:{" "}
                          {model.modelName}
                        </ServiceName>
                      </Flex>
                      <StatusBadge $status={model.status}>
                        {model.status}
                      </StatusBadge>
                    </ServiceHeader>

                    {model.responseTime !== undefined && (
                      <ServiceDetail>
                        <DetailLabel>{t("Response Time")}:</DetailLabel>
                        <DetailValue>{model.responseTime}ms</DetailValue>
                      </ServiceDetail>
                    )}

                    {sourceLabel && (
                      <ServiceDetail>
                        <DetailLabel>{t("Configuration source")}:</DetailLabel>
                        <DetailValue>{sourceLabel}</DetailValue>
                      </ServiceDetail>
                    )}

                    {model.details?.endpoint && (
                      <ServiceDetail>
                        <DetailLabel>{t("Endpoint")}:</DetailLabel>
                        <DetailValue>{model.details.endpoint}</DetailValue>
                      </ServiceDetail>
                    )}

                    {model.error && <ErrorMessage>{model.error}</ErrorMessage>}
                  </ServiceCard>
                );
              })}

              <ServiceCard>
                <ServiceHeader>
                  <Flex align="center" gap={8}>
                    {getStatusIcon(healthData.services.asr.status)}
                    <ServiceName>{t("ASR Service")}</ServiceName>
                  </Flex>
                  <StatusBadge $status={healthData.services.asr.status}>
                    {healthData.services.asr.status}
                  </StatusBadge>
                </ServiceHeader>

                {healthData.services.asr.responseTime !== undefined && (
                  <ServiceDetail>
                    <DetailLabel>{t("Response Time")}:</DetailLabel>
                    <DetailValue>
                      {healthData.services.asr.responseTime}ms
                    </DetailValue>
                  </ServiceDetail>
                )}

                {healthData.services.asr.details?.endpoint && (
                  <ServiceDetail>
                    <DetailLabel>{t("Endpoint")}:</DetailLabel>
                    <DetailValue>
                      {healthData.services.asr.details.endpoint}
                    </DetailValue>
                  </ServiceDetail>
                )}

                {healthData.services.asr.error && (
                  <ErrorMessage>{healthData.services.asr.error}</ErrorMessage>
                )}
              </ServiceCard>
            </ServicesGrid>
          </>
        )}
      </Container>
    </Scene>
  );
}

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
`;

const Header = styled.div`
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: ${s("text")};
`;

const Subtitle = styled(Text)`
  font-size: 16px;
`;

const ErrorBox = styled(Flex)`
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: ${(props) => props.theme.white10};
  border: 1px solid ${s("danger")};
  border-radius: 8px;
  margin-bottom: 24px;
`;

const OverallStatus = styled.div<{ $status: string }>`
  padding: 24px;
  background: ${(props) => props.theme.white10};
  border: 1px solid
    ${(props) =>
      props.$status === "healthy"
        ? s("accent")
        : props.$status === "unhealthy"
          ? s("danger")
          : s("warning")};
  border-radius: 12px;
  margin-bottom: 32px;
`;

const StatusTitle = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: ${s("text")};
`;

const StatusTime = styled(Text)`
  margin-top: 4px;
`;

const ServicesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
`;

const ServiceCard = styled.div`
  padding: 20px;
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
`;

const ServiceHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${s("divider")};
`;

const ServiceName = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: ${s("text")};
`;

const StatusBadge = styled.span<{ $status: string }>`
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  background: ${(props) => props.theme.white10};
  color: ${(props) =>
    props.$status === "healthy"
      ? s("accent")
      : props.$status === "unhealthy"
        ? s("danger")
        : s("textTertiary")};
`;

const ServiceDetail = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 14px;
`;

const DetailLabel = styled.span`
  color: ${s("textSecondary")};
`;

const DetailValue = styled.span`
  color: ${s("text")};
  font-weight: 500;
  word-break: break-all;
`;

const ErrorMessage = styled.div`
  margin-top: 12px;
  padding: 12px;
  background: ${(props) => props.theme.white10};
  border-radius: 6px;
  font-size: 13px;
  color: ${s("danger")};
  word-break: break-word;
`;

export default observer(Health);
