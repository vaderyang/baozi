import { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  Column,
  DataType,
  BelongsTo,
  ForeignKey,
  Table,
  IsIn,
  AllowNull,
} from "sequelize-typescript";
import Team from "./Team";
import IdModel from "./base/IdModel";
import Fix from "./decorators/Fix";

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type LLMModelHealth = {
  modelName: string;
  status: HealthStatus;
  responseTime: number | null;
  error: string | null;
  roles: string[];
  source: "team" | "environment";
  endpoint: string | null;
};

@Table({ tableName: "health_checks", modelName: "health_check" })
@Fix
class HealthCheck extends IdModel<
  InferAttributes<HealthCheck>,
  Partial<InferCreationAttributes<HealthCheck>>
> {
  @Column(DataType.DATE)
  timestamp: Date;

  @IsIn([["healthy", "degraded", "unhealthy"]])
  @Column(DataType.STRING)
  overallStatus: "healthy" | "degraded" | "unhealthy";

  @IsIn([["healthy", "unhealthy", "unknown"]])
  @Column(DataType.STRING)
  databaseStatus: HealthStatus;

  @AllowNull
  @Column(DataType.INTEGER)
  databaseResponseTime: number | null;

  @AllowNull
  @Column(DataType.TEXT)
  databaseError: string | null;

  @Column(DataType.JSONB)
  llmModelsHealth: LLMModelHealth[];

  @IsIn([["healthy", "unhealthy", "unknown"]])
  @Column(DataType.STRING)
  asrStatus: HealthStatus;

  @AllowNull
  @Column(DataType.INTEGER)
  asrResponseTime: number | null;

  @AllowNull
  @Column(DataType.TEXT)
  asrError: string | null;

  @AllowNull
  @Column(DataType.TEXT)
  asrEndpoint: string | null;

  // associations

  @BelongsTo(() => Team, "teamId")
  team: Team | null;

  @AllowNull
  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string | null;
}

export default HealthCheck;
