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
import User from "./User";
import IdModel from "./base/IdModel";
import Fix from "./decorators/Fix";
import { ServiceType } from "./ServiceMetric";

@Table({ tableName: "failed_requests", modelName: "failed_request" })
@Fix
class FailedRequest extends IdModel<
  InferAttributes<FailedRequest>,
  Partial<InferCreationAttributes<FailedRequest>>
> {
  @Column(DataType.DATE)
  timestamp: Date;

  @IsIn([Object.values(ServiceType)])
  @Column(DataType.STRING(20))
  serviceType: ServiceType;

  @Column(DataType.STRING(255))
  modelName: string | null;

  @Column(DataType.STRING(255))
  username: string;

  @Column(DataType.TEXT)
  errorMessage: string;

  @Column(DataType.STRING(100))
  errorCode: string | null;

  @Column(DataType.JSONB)
  requestParameters: Record<string, any> | null;

  // associations

  @BelongsTo(() => User, "userId")
  user: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  userId: string;

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  /**
   * Find failed requests by service type and time range.
   *
   * @param params - Query parameters
   * @returns Array of failed requests
   */
  static async findByServiceAndTimeRange(params: {
    serviceType: ServiceType;
    startTime: Date;
    endTime: Date;
    teamId: string;
    limit?: number;
  }): Promise<FailedRequest[]> {
    return this.findAll({
      where: {
        serviceType: params.serviceType,
        teamId: params.teamId,
        timestamp: {
          [Op.gte]: params.startTime,
          [Op.lte]: params.endTime,
        },
      },
      order: [["timestamp", "DESC"]],
      limit: params.limit,
    });
  }

  /**
   * Find failed requests by user.
   *
   * @param userId - User ID
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @returns Array of failed requests
   */
  static async findByUser(
    userId: string,
    startTime: Date,
    endTime: Date
  ): Promise<FailedRequest[]> {
    return this.findAll({
      where: {
        userId,
        timestamp: {
          [Op.gte]: startTime,
          [Op.lte]: endTime,
        },
      },
      order: [["timestamp", "DESC"]],
    });
  }

  /**
   * Delete failed requests older than the specified date.
   *
   * @param cutoffDate - Date before which to delete
   * @returns Number of deleted failed requests
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

  /**
   * Count failed requests by service type and time range.
   *
   * @param params - Query parameters
   * @returns Count of failed requests
   */
  static async countByServiceAndTimeRange(params: {
    serviceType: ServiceType;
    startTime: Date;
    endTime: Date;
    teamId: string;
  }): Promise<number> {
    return this.count({
      where: {
        serviceType: params.serviceType,
        teamId: params.teamId,
        timestamp: {
          [Op.gte]: params.startTime,
          [Op.lte]: params.endTime,
        },
      },
    });
  }
}

export default FailedRequest;
