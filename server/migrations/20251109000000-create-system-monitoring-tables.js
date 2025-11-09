"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Create health_checks table
      await queryInterface.createTable(
        "health_checks",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          timestamp: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          overallStatus: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          databaseStatus: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          databaseResponseTime: {
            type: Sequelize.INTEGER,
            allowNull: true,
          },
          databaseError: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          llmModelsHealth: {
            type: Sequelize.JSONB,
            allowNull: false,
          },
          asrStatus: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          asrResponseTime: {
            type: Sequelize.INTEGER,
            allowNull: true,
          },
          asrError: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          asrEndpoint: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          teamId: {
            type: Sequelize.UUID,
            allowNull: true,
            onDelete: "cascade",
            references: {
              model: "teams",
            },
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction }
      );

      // Add indexes for health_checks
      await queryInterface.addIndex("health_checks", ["timestamp"], {
        name: "idx_health_checks_timestamp",
        order: [["timestamp", "DESC"]],
        transaction,
      });

      await queryInterface.addIndex("health_checks", ["teamId", "timestamp"], {
        name: "idx_health_checks_team_timestamp",
        order: [
          ["teamId", "ASC"],
          ["timestamp", "DESC"],
        ],
        transaction,
      });

      // Create service_metrics table
      await queryInterface.createTable(
        "service_metrics",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          timestamp: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          intervalType: {
            type: Sequelize.STRING(10),
            allowNull: false,
          },
          serviceType: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          modelName: {
            type: Sequelize.STRING(255),
            allowNull: true,
          },
          tokensPerSecond: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
          },
          totalInputTokens: {
            type: Sequelize.BIGINT,
            allowNull: true,
          },
          totalOutputTokens: {
            type: Sequelize.BIGINT,
            allowNull: true,
          },
          averageAudioLength: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
          },
          averageTranscriptLength: {
            type: Sequelize.INTEGER,
            allowNull: true,
          },
          transcriptionSpeed: {
            type: Sequelize.DECIMAL(10, 4),
            allowNull: true,
          },
          totalRequests: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          successfulRequests: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          failedRequests: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          successRate: {
            type: Sequelize.DECIMAL(5, 2),
            allowNull: false,
          },
          maxQueueDepth: {
            type: Sequelize.INTEGER,
            allowNull: true,
          },
          averageQueueDepth: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
          },
          averageWaitTime: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
          },
          teamId: {
            type: Sequelize.UUID,
            allowNull: true,
            onDelete: "cascade",
            references: {
              model: "teams",
            },
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction }
      );

      // Add indexes for service_metrics
      await queryInterface.addIndex(
        "service_metrics",
        ["serviceType", "intervalType", "timestamp"],
        {
          name: "idx_service_metrics_lookup",
          order: [
            ["serviceType", "ASC"],
            ["intervalType", "ASC"],
            ["timestamp", "DESC"],
          ],
          transaction,
        }
      );

      await queryInterface.addIndex(
        "service_metrics",
        ["modelName", "timestamp"],
        {
          name: "idx_service_metrics_model",
          where: {
            modelName: {
              [Sequelize.Op.ne]: null,
            },
          },
          order: [
            ["modelName", "ASC"],
            ["timestamp", "DESC"],
          ],
          transaction,
        }
      );

      await queryInterface.addIndex(
        "service_metrics",
        ["teamId", "timestamp"],
        {
          name: "idx_service_metrics_team",
          where: {
            teamId: {
              [Sequelize.Op.ne]: null,
            },
          },
          order: [
            ["teamId", "ASC"],
            ["timestamp", "DESC"],
          ],
          transaction,
        }
      );

      // Create failed_requests table
      await queryInterface.createTable(
        "failed_requests",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          timestamp: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          serviceType: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          modelName: {
            type: Sequelize.STRING(255),
            allowNull: true,
          },
          userId: {
            type: Sequelize.UUID,
            allowNull: false,
            onDelete: "cascade",
            references: {
              model: "users",
            },
          },
          username: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          errorMessage: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          errorCode: {
            type: Sequelize.STRING(100),
            allowNull: true,
          },
          requestParameters: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          teamId: {
            type: Sequelize.UUID,
            allowNull: false,
            onDelete: "cascade",
            references: {
              model: "teams",
            },
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction }
      );

      // Add indexes for failed_requests
      await queryInterface.addIndex(
        "failed_requests",
        ["serviceType", "timestamp"],
        {
          name: "idx_failed_requests_lookup",
          order: [
            ["serviceType", "ASC"],
            ["timestamp", "DESC"],
          ],
          transaction,
        }
      );

      await queryInterface.addIndex(
        "failed_requests",
        ["teamId", "timestamp"],
        {
          name: "idx_failed_requests_team",
          order: [
            ["teamId", "ASC"],
            ["timestamp", "DESC"],
          ],
          transaction,
        }
      );

      await queryInterface.addIndex(
        "failed_requests",
        ["userId", "timestamp"],
        {
          name: "idx_failed_requests_user",
          order: [
            ["userId", "ASC"],
            ["timestamp", "DESC"],
          ],
          transaction,
        }
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("failed_requests", { transaction });
      await queryInterface.dropTable("service_metrics", { transaction });
      await queryInterface.dropTable("health_checks", { transaction });
    });
  },
};
