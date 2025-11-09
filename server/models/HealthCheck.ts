import { InferAttributes, InferCreationAttributes, Op } from "sequelize";
import {
  ForeignKey,
  BelongsTo,
  Column,
  Table,
  DataType,
  IsIn,
} from "sequelize-typescript";
import Team from "./Team";
import IdModel from "./base/IdModel";
import Fix from "./decorators/Fix";

export enum HealthStatus {
  Healthy = "healthy",
  Degraded = "degraded",
  Unhealthy = "unhealthy",
  Unknown = "unknown",
}

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

  @IsIn([Object.values(HealthStatus)])
  @Column(DataType.STRING(20))
  overallStatus: HealthStatus;

  @IsIn([Object.values(HealthStatus)])
  @Column(DataType.STRING(20))
  databaseStatus: HealthStatus;

  @Column(DataType.INTEGER)
  databaseResponseTime: number | null;

  @Column(DataType.TEXT)
  databaseError: string | null;

  @Column(DataType.JSONB)
  llmModelsHealth: LLMModelHealth[];

  @IsIn([Object.values(HealthStatus)])
  @Column(DataType.STRING(20))
  asrStatus: HealthStatus;

  @Column(DataType.INTEGER)
  asrResponseTime: number | null;

  @Column(DataType.TEXT)
  asrError: string | null;

  @Column(DataType.TEXT)
  asrEndpoint: string | null;

  // associations

  @BelongsTo(() => Team, "teamId")
  team: Team | null;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string | null;

  /**
   * Find health checks within a time range.
   *
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @param teamId - Optional team ID filter
   * @returns Array of health checks
   */
  static async findByTimeRange(
    startTime: Date,
    endTime: Date,
    teamId?: string
  ): Promise<HealthCheck[]> {
    const where: any = {
      timestamp: {
        [Op.gte]: startTime,
        [Op.lte]: endTime,
      },
    };

    if (teamId !== undefined) {
      where.teamId = teamId;
    }

    return this.findAll({
      where,
      order: [["timestamp", "DESC"]],
    });
  }

  /**
   * Get the most recent health check.
   *
   * @param teamId - Optional team ID filter
   * @returns Most recent health check or null
   */
  static async findMostRecent(teamId?: string): Promise<HealthCheck | null> {
    const where: any = {};

    if (teamId !== undefined) {
      where.teamId = teamId;
    }

    return this.findOne({
      where,
      order: [["timestamp", "DESC"]],
    });
  }

  /**
   * Delete health checks older than the specified date.
   *
   * @param cutoffDate - Date before which to delete
   * @returns Number of deleted health checks
   */
  static async deleteOlderThan(cutoffDate: Date): Promise<number> {
    return this.destroy({
      where: {
        createdAt: {
          [Op.lt]: cutoffDate,
        },
      },
    });
  }
}

export default HealthCheck;
