import { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  Column,
  DataType,
  BelongsTo,
  ForeignKey,
  Table,
  IsIn,
  AllowNull,
  IsNumeric,
} from "sequelize-typescript";
import Team from "./Team";
import IdModel from "./base/IdModel";
import Fix from "./decorators/Fix";

export type IntervalType = "5min" | "1hour" | "1day";
export type ServiceType = "llm" | "transcription";

@Table({ tableName: "service_metrics", modelName: "service_metric" })
@Fix
class ServiceMetric extends IdModel<
  InferAttributes<ServiceMetric>,
  Partial<InferCreationAttributes<ServiceMetric>>
> {
  @Column(DataType.DATE)
  timestamp: Date;

  @IsIn([["5min", "1hour", "1day"]])
  @Column(DataType.STRING)
  intervalType: IntervalType;

  @IsIn([["llm", "transcription"]])
  @Column(DataType.STRING)
  serviceType: ServiceType;

  // LLM-specific fields
  @AllowNull
  @Column(DataType.STRING)
  modelName: string | null;

  @AllowNull
  @Column(DataType.DECIMAL(10, 2))
  tokensPerSecond: number | null;

  @AllowNull
  @Column(DataType.BIGINT)
  totalInputTokens: number | null;

  @AllowNull
  @Column(DataType.BIGINT)
  totalOutputTokens: number | null;

  // Transcription-specific fields
  @AllowNull
  @Column(DataType.DECIMAL(10, 2))
  averageAudioLength: number | null;

  @AllowNull
  @IsNumeric
  @Column(DataType.INTEGER)
  averageTranscriptLength: number | null;

  @AllowNull
  @Column(DataType.DECIMAL(10, 4))
  transcriptionSpeed: number | null;

  // Common fields
  @IsNumeric
  @Column(DataType.INTEGER)
  totalRequests: number;

  @IsNumeric
  @Column(DataType.INTEGER)
  successfulRequests: number;

  @IsNumeric
  @Column(DataType.INTEGER)
  failedRequests: number;

  @Column(DataType.DECIMAL(5, 2))
  successRate: number;

  // Queue metrics (optional)
  @AllowNull
  @IsNumeric
  @Column(DataType.INTEGER)
  maxQueueDepth: number | null;

  @AllowNull
  @Column(DataType.DECIMAL(10, 2))
  averageQueueDepth: number | null;

  @AllowNull
  @Column(DataType.DECIMAL(10, 2))
  averageWaitTime: number | null;

  // associations

  @BelongsTo(() => Team, "teamId")
  team: Team | null;

  @AllowNull
  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string | null;
}

export default ServiceMetric;
