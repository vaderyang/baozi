"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.createTable(
                "ai_summary_jobs",
                {
                    id: {
                        type: Sequelize.UUID,
                        allowNull: false,
                        primaryKey: true,
                    },
                    teamId: {
                        type: Sequelize.UUID,
                        allowNull: false,
                        onDelete: "cascade",
                        references: {
                            model: "teams",
                        },
                    },
                    userId: {
                        type: Sequelize.UUID,
                        allowNull: false,
                        onDelete: "cascade",
                        references: {
                            model: "users",
                        },
                    },
                    documentId: {
                        type: Sequelize.UUID,
                        allowNull: false,
                        onDelete: "cascade",
                        references: {
                            model: "documents",
                        },
                    },
                    status: {
                        type: Sequelize.STRING(20),
                        allowNull: false,
                        defaultValue: "queued",
                    },
                    progress: {
                        type: Sequelize.INTEGER,
                        allowNull: true,
                    },
                    error: {
                        type: Sequelize.TEXT,
                        allowNull: true,
                    },
                    result: {
                        type: Sequelize.TEXT,
                        allowNull: true,
                    },
                    prompt: {
                        type: Sequelize.TEXT,
                        allowNull: false,
                    },
                    context: {
                        type: Sequelize.TEXT,
                        allowNull: false,
                    },
                    metadata: {
                        type: Sequelize.JSONB,
                        allowNull: true,
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

            await queryInterface.addIndex(
                "ai_summary_jobs",
                ["documentId"],
                { transaction }
            );
            await queryInterface.addIndex(
                "ai_summary_jobs",
                ["status"],
                { transaction }
            );
            await queryInterface.addIndex(
                "ai_summary_jobs",
                ["createdAt"],
                { transaction }
            );
            await queryInterface.addIndex(
                "ai_summary_jobs",
                ["userId"],
                { transaction }
            );
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.dropTable("ai_summary_jobs", { transaction });
        });
    },
};
