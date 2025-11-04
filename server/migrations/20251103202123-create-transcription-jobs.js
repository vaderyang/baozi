"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.createTable(
                "transcription_jobs",
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
                    attachmentId: {
                        type: Sequelize.UUID,
                        allowNull: false,
                        onDelete: "set null",
                        references: {
                            model: "attachments",
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
                "transcription_jobs",
                ["documentId"],
                { transaction }
            );
            await queryInterface.addIndex(
                "transcription_jobs",
                ["status"],
                { transaction }
            );
            await queryInterface.addIndex(
                "transcription_jobs",
                ["createdAt"],
                { transaction }
            );
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.dropTable("transcription_jobs", { transaction });
        });
    },
};
