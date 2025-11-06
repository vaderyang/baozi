"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Add sourceType and metadata to transcription_jobs
      await queryInterface.addColumn(
        "transcription_jobs",
        "sourceType",
        {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: "recording",
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "transcription_jobs",
        "metadata",
        {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        { transaction }
      );

      // Add audioMetadata to documents
      await queryInterface.addColumn(
        "documents",
        "audioMetadata",
        {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        { transaction }
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("transcription_jobs", "sourceType", {
        transaction,
      });

      await queryInterface.removeColumn("transcription_jobs", "metadata", {
        transaction,
      });

      await queryInterface.removeColumn("documents", "audioMetadata", {
        transaction,
      });
    });
  },
};
