"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Note: sourceType and metadata columns already exist from 20251106000000-add-audio-fields.js
      // This migration adds timestamp and progress message tracking

      // Add timestamp columns for job lifecycle tracking
      await queryInterface.addColumn(
        "transcription_jobs",
        "startedAt",
        {
          type: Sequelize.DATE,
          allowNull: true,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "transcription_jobs",
        "completedAt",
        {
          type: Sequelize.DATE,
          allowNull: true,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "transcription_jobs",
        "failedAt",
        {
          type: Sequelize.DATE,
          allowNull: true,
        },
        { transaction }
      );

      // Add lastProgressMessage for storing progress status messages
      await queryInterface.addColumn(
        "transcription_jobs",
        "lastProgressMessage",
        {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        { transaction }
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn(
        "transcription_jobs",
        "lastProgressMessage",
        { transaction }
      );

      await queryInterface.removeColumn("transcription_jobs", "failedAt", {
        transaction,
      });

      await queryInterface.removeColumn("transcription_jobs", "completedAt", {
        transaction,
      });

      await queryInterface.removeColumn("transcription_jobs", "startedAt", {
        transaction,
      });
    });
  },
};
