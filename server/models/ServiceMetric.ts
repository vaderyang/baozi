import { InferAttributes, InferCreationAttributes, Op } from "sequelize";
import {
  ForeignKey,
  BelongsTo,
  Column,
  Table,
  DataType,
  IsIn,
  IsInt,
  Min,
} from "sequelize-typescript";
import Team from "./Team";
import IdModel from "./base/IdModel";
import Fix from "./decorators/Fix";

export enum IntervalType {
  FiveMinute = "5min",
  OneHour = "1hour",
  OneDay = "1day",
}

export enum ServiceType {
  LLM = "llm",
  Transcription = "transcription",
}

@Table({ tableName: "service_metrics", modelName: "service_metric" })
@Fix
class ServiceMetric extends IdModel<
  InferAttributes<ServiceMetric>,
  Partial<InferCreationAttributes<ServiceMetric>>
> {
  @Column(DataType.DATE)
  timestamp: Date;

  @IsIn([Object.values(IntervalType)])
  @Column(DataType.STRING(10))
  intervalType: IntervalType;

  @IsIn([Object.values(ServiceType)])
  @Column(DataType.STRING(20))
  serviceType: ServiceType;

  // LLM-specific fields
  @Column(DataType.STRING(255))
  modelName: string | null;

  @Column(DataType.DECIMAL(10, 2))
  tokensPerSecond: number | null;

  @Column(DataType.BIGINT)
  totalInputTokens: number | null;

  @Column(DataType.BIGINT)
  totalOutputTokens: number | null;

  // Transcription-specific fields
  @Column(DataType.DECIMAL(10, 2))
  averageAudioLength: number | null;

  @Column(DataType.INTEGER)
  averageTranscriptLength: number | null;

  @Column(DataType.DECIMAL(10, 4))
  transcriptionSpeed: number | null;

  // Common fields
  @IsInt
  @Min(0)
  @Column(DataType.INTEGER)
  totalRequests: number;

  @IsInt
  @Min(0)
  @Column(DataType.INTEGER)
  successfulRequests: number;

  @IsInt
  @Min(0)
  @Column(DataType.INTEGER)
  failedRequests: number;

  @Column(DataType.DECIMAL(5, 2))
  successRate: number;

  // Queue metrics (optional)
  @Column(DataType.INTEGER)
  maxQueueDepth: number | null;

  @Column(DataType.DECIMAL(10, 2))
  averageQueueDepth: number | null;

  @Column(DataType.DECIMAL(10, 2))
  averageWaitTime: number | null;

  // associations

  @BelongsTo(() => Team, "teamId")
  team: Team | null;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string | null;

  /**
   * Find metrics by service type and time range.
   *
   * @param params - Query parameters
   * @returns Array of service metrics
   */
  static async findByServiceAndTimeRange(params: {
    serviceType: ServiceType;
    intervalType: IntervalType;
    startTime: Date;
    endTime: Date;
    modelName?: string;
    teamId?: string;
  }): Promise<ServiceMetric[]> {
    const where: any = {
      serviceType: params.serviceType,
      intervalType: params.intervalType,
      timestamp: {
        [Op.gte]: params.startTime,
        [Op.lte]: params.endTime,
      },
    };

    if (params.modelName) {
      where.modelName = params.modelName;
    }

    if (params.teamId !== undefined) {
      where.teamId = params.teamId;
    }

    return this.findAll({
      where,
      order: [["timestamp", "ASC"]],
    });
  }

  /**
   * Delete metrics older than the specified date for a given interval type.
   *
   * @param intervalType - The interval type to clean up
   * @param cutoffDate - Date before which to delete
   * @returns Number of deleted metrics
   */
  static async deleteOlderThan(
    intervalType: IntervalType,
    cutoffDate: Date
  ): Promise<number> {
    return this.destroy({
      where: {
        intervalType,
        createdAt: {
          [Op.lt]: cutoffDate,
        },
      },
    });
  }

  /**
   * Get aggregated metrics summary for a time range.
   *
   * @param params - Query parameters
   * @returns Aggregated summary
   */
  static async getAggregatedSummary(params: {
    serviceType: ServiceType;
    intervalType: IntervalType;
    startTime: Date;
    endTime: Date;
    teamId?: string;
  }): Promise<{
    totalRequests: number;
    averageSuccessRate: number;
    averageTPS?: number;
  }> {
    const metrics = await this.findByServiceAndTimeRange(params);

    if (metrics.length === 0) {
      return {
        totalRequests: 0,
        averageSuccessRate: 0,
      };
    }

    const totalRequests = metrics.reduce((sum, m) => sum + m.totalRequests, 0);
    const averageSuccessRate =
      metrics.reduce((sum, m) => sum + m.successRate, 0) / metrics.length;

    const result: any = {
      totalRequests,
      averageSuccessRate,
    };

    if (params.serviceType === ServiceType.LLM) {
      const tpsMetrics = metrics.filter((m) => m.tokensPerSecond !== null);
      if (tpsMetrics.length > 0) {
        result.averageTPS =
          tpsMetrics.reduce((sum, m) => sum + (m.tokensPerSecond || 0), 0) /
          tpsMetrics.length;
      }
    }

    return result;
  }
}

export default ServiceMetric;
