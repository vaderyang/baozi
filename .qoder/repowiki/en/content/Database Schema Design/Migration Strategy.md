# Migration Strategy

<cite>
**Referenced Files in This Document**   
- [20160812145029-document-atlas-soft-delete.js](file://server/migrations/20160812145029-document-atlas-soft-delete.js)
- [20190404035736-add-archive.js](file://server/migrations/20190404035736-add-archive.js)
- [20160814083127-paranoia-indeces.js](file://server/migrations/20160814083127-paranoia-indeces.js)
- [20180707220121-more-soft-delete.js](file://server/migrations/20180707220121-more-soft-delete.js)
- [20231001032754-file-operation-paranoid.js](file://server/migrations/20231001032754-file-operation-paranoid.js)
- [20240806080954-group-users-paranoid.js](file://server/migrations/20240806080954-group-users-paranoid.js)
- [20240810080954-group-users-remove-deleted-at.js](file://server/migrations/20240810080954-group-users-remove-deleted-at.js)
- [20240912222438-add-unaccent-extension.js](file://server/migrations/20240912222438-add-unaccent-extension.js)
- [ParanoidModel.ts](file://server/models/base/ParanoidModel.ts)
- [ArchivableModel.ts](file://server/models/base/ArchivableModel.ts)
- [database.ts](file://server/storage/database.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Migration File Structure](#migration-file-structure)
3. [Soft-Delete Implementation](#soft-delete-implementation)
4. [Archiving Functionality](#archiving-functionality)
5. [Migration Execution Process](#migration-execution-process)
6. [Migration Helpers and Common Operations](#migration-helpers-and-common-operations)
7. [Complex Migration Examples](#complex-migration-examples)
8. [Testing Strategy](#testing-strategy)
9. [Zero-Downtime Deployment Considerations](#zero-downtime-deployment-considerations)
10. [Best Practices](#best-practices)

## Introduction
The baozi application employs a robust database migration strategy using Sequelize migrations to manage schema evolution. The migration system is located in the `server/migrations/` directory and provides a structured approach to database schema changes, ensuring version control and consistency across environments. This documentation details the implementation of soft-delete patterns through `ParanoidModel` and archiving functionality via `ArchivableModel`, along with the complete migration lifecycle from development to production deployment.

**Section sources**
- [database.ts](file://server/storage/database.ts#L130-L184)

## Migration File Structure
Migration files in the baozi application follow a standardized structure with `up()` and `down()` methods that enable reversible schema changes. Each migration file is named with a timestamp prefix (e.g., `20160812145029-document-atlas-soft-delete.js`) to ensure proper ordering during execution. The `up()` method contains the logic to apply the migration, while the `down()` method provides the rollback procedure. This structure allows for safe deployment and easy rollback in case of issues.

```mermaid
flowchart TD
Start([Migration File]) --> FileName["Filename: timestamp-description.js"]
FileName --> UpMethod["up(queryInterface, Sequelize)"]
FileName --> DownMethod["down(queryInterface, Sequelize)"]
UpMethod --> Operations["Database Operations"]
DownMethod --> ReverseOperations["Reverse Operations"]
Operations --> Complete["Migration Applied"]
ReverseOperations --> RolledBack["Migration Rolled Back"]
```

**Diagram sources**
- [20160812145029-document-atlas-soft-delete.js](file://server/migrations/20160812145029-document-atlas-soft-delete.js#L1-L17)

**Section sources**
- [20160812145029-document-atlas-soft-delete.js](file://server/migrations/20160812145029-document-atlas-soft-delete.js#L1-L17)

## Soft-Delete Implementation
The baozi application implements soft-delete functionality through the `ParanoidModel` base class, which adds a `deletedAt` timestamp column to track deletion status without permanently removing records. This pattern is applied across multiple models including documents, users, and teams. The `ParanoidModel` class provides an `isDeleted` getter that returns true when `deletedAt` is set, enabling logical deletion while preserving data integrity.

```mermaid
classDiagram
class ParanoidModel {
+Date | null deletedAt
+get isDeleted() boolean
}
class Document {
+string title
+string content
}
class User {
+string email
+string name
}
class Team {
+string name
+string subdomain
}
Document --> ParanoidModel : "extends"
User --> ParanoidModel : "extends"
Team --> ParanoidModel : "extends"
```

**Diagram sources**
- [ParanoidModel.ts](file://server/models/base/ParanoidModel.ts#L1-L21)
- [20180707220121-more-soft-delete.js](file://server/migrations/20180707220121-more-soft-delete.js#L1-L17)

**Section sources**
- [ParanoidModel.ts](file://server/models/base/ParanoidModel.ts#L1-L21)
- [20180707220121-more-soft-delete.js](file://server/migrations/20180707220121-more-soft-delete.js#L1-L17)

## Archiving Functionality
Archiving in the baozi application is implemented through the `ArchivableModel` class, which extends `ParanoidModel` and adds an `archivedAt` timestamp column. This allows for a distinct archival state separate from deletion, enabling users to temporarily hide content while preserving it for potential restoration. The `ArchivableModel` provides an `isArchived` getter that returns true when `archivedAt` is set, facilitating conditional logic based on archival status.

```mermaid
classDiagram
class ParanoidModel {
+Date | null deletedAt
+get isDeleted() boolean
}
class ArchivableModel {
+Date | null archivedAt
+get isArchived() boolean
}
class Document {
+string title
+string content
}
ParanoidModel <|-- ArchivableModel : "extends"
ArchivableModel <|-- Document : "extends"
```

**Diagram sources**
- [ArchivableModel.ts](file://server/models/base/ArchivableModel.ts#L1-L24)
- [20190404035736-add-archive.js](file://server/migrations/20190404035736-add-archive.js#L1-L12)

**Section sources**
- [ArchivableModel.ts](file://server/models/base/ArchivableModel.ts#L1-L24)
- [20190404035736-add-archive.js](file://server/migrations/20190404035736-add-archive.js#L1-L12)

## Migration Execution Process
The migration execution process in the baozi application is managed through the Umzug library, which provides a robust framework for running Sequelize migrations. The `createMigrationRunner` function in `database.ts` configures the migration runner with the appropriate glob pattern to locate migration files in the `server/migrations/` directory. Migrations are executed in order based on their timestamp prefixes, ensuring proper dependency resolution.

```mermaid
sequenceDiagram
participant CLI as "Migration CLI"
participant Runner as "Umzug Runner"
participant DB as "Database"
participant Logger as "Application Logger"
CLI->>Runner : executeMigrations()
Runner->>Runner : Discover migration files
Runner->>Runner : Sort by timestamp
loop Each migration
Runner->>Logger : Log "Migrating migration_name…"
Runner->>DB : Execute up() method
DB-->>Runner : Confirmation
Runner->>Logger : Log "Migrated migration_name"
end
Runner-->>CLI : All migrations complete
```

**Diagram sources**
- [database.ts](file://server/storage/database.ts#L130-L184)

**Section sources**
- [database.ts](file://server/storage/database.ts#L130-L184)

## Migration Helpers and Common Operations
The baozi application provides several migration helpers for common database operations such as adding indexes, modifying columns, and managing constraints. The `20160814083127-paranoia-indeces.js` migration demonstrates the use of index management helpers, where old indexes are removed and new composite indexes are created that include the `deletedAt` column for improved query performance on soft-deleted records.

```mermaid
flowchart TD
Start([Migration Helper]) --> AddIndex["addIndex(table, columns)"]
Start --> RemoveIndex["removeIndex(table, columns)"]
Start --> AddColumn["addColumn(table, column, options)"]
Start --> RemoveColumn["removeColumn(table, column)"]
Start --> AddConstraint["addConstraint(table, fields, type)"]
Start --> RemoveConstraint["removeConstraint(table, name)"]
AddIndex --> Composite["Composite Indexes with deletedAt"]
RemoveIndex --> Cleanup["Remove Obsolete Indexes"]
AddColumn --> SoftDelete["Add deletedAt Column"]
RemoveColumn --> Refactor["Remove deprecated columns"]
AddConstraint --> PK["Primary Key Constraints"]
RemoveConstraint --> Modify["Modify existing constraints"]
```

**Diagram sources**
- [20160814083127-paranoia-indeces.js](file://server/migrations/20160814083127-paranoia-indeces.js#L1-L52)

**Section sources**
- [20160814083127-paranoia-indeces.js](file://server/migrations/20160814083127-paranoia-indeces.js#L1-L52)

## Complex Migration Examples
The baozi application includes several complex migration examples that demonstrate advanced database schema evolution techniques. The `20240810080954-group-users-remove-deleted-at.js` migration illustrates a sophisticated schema refactor where the `deletedAt` column is removed from the `group_users` table and replaced with a composite primary key of `groupId` and `userId`. This migration includes data cleanup steps to remove duplicate rows before applying the constraint.

```mermaid
flowchart TD
Start([Complex Migration]) --> DataCleanup["Delete rows with deletedAt NOT NULL"]
DataCleanup --> RemoveColumn["Remove deletedAt column"]
RemoveColumn --> CleanupDuplicates["Delete duplicate groupId + userId rows"]
CleanupDuplicates --> AddPK["Add composite primary key (groupId, userId)"]
AddPK --> RemoveIndex["Remove redundant index"]
RemoveIndex --> Complete["Migration Complete"]
style Start fill:#f9f,stroke:#333
style Complete fill:#bbf,stroke:#333
```

**Diagram sources**
- [20240806080954-group-users-paranoid.js](file://server/migrations/20240806080954-group-users-paranoid.js#L1-L15)
- [20240810080954-group-users-remove-deleted-at.js](file://server/migrations/20240810080954-group-users-remove-deleted-at.js#L1-L40)

**Section sources**
- [20240806080954-group-users-paranoid.js](file://server/migrations/20240806080954-group-users-paranoid.js#L1-L15)
- [20240810080954-group-users-remove-deleted-at.js](file://server/migrations/20240810080954-group-users-remove-deleted-at.js#L1-L40)

## Testing Strategy
The testing strategy for migrations in the baozi application includes both automated tests and manual verification procedures. Migration scripts are tested in isolated environments that mirror production conditions, with rollback verification to ensure that the `down()` methods correctly revert all changes. The test suite includes specific test cases for data integrity, constraint validation, and performance impact assessment.

```mermaid
flowchart TD
Start([Migration Testing]) --> UnitTests["Unit Tests for Migration Logic"]
UnitTests --> IntegrationTests["Integration Tests with Database"]
IntegrationTests --> RollbackVerification["Rollback Procedure Verification"]
RollbackVerification --> PerformanceTesting["Performance Impact Assessment"]
PerformanceTesting --> DataIntegrity["Data Integrity Validation"]
DataIntegrity --> Complete["Testing Complete"]
```

**Section sources**
- [20230827234031-migrate-emoji-in-revision-title.ts](file://server/scripts/20230827234031-migrate-emoji-in-revision-title.ts#L32-L62)

## Zero-Downtime Deployment Considerations
The baozi application employs several strategies to ensure zero-downtime deployments during database migrations. Migrations are designed to be backward compatible, allowing old and new application versions to coexist during deployment windows. Long-running migrations are broken into smaller batches, and critical operations are scheduled during low-traffic periods to minimize impact on user experience.

```mermaid
flowchart TD
Start([Zero-Downtime Deployment]) --> BackwardCompatibility["Ensure backward compatibility"]
BackwardCompatibility --> BatchProcessing["Break into small batches"]
BatchProcessing --> OffPeakScheduling["Schedule during low-traffic periods"]
OffPeakScheduling --> Monitoring["Real-time monitoring"]
Monitoring --> RollbackPlan["Prepare rollback procedure"]
RollbackPlan --> Complete["Deployment Complete"]
```

**Section sources**
- [20240912222438-add-unaccent-extension.js](file://server/migrations/20240912222438-add-unaccent-extension.js#L1-L16)

## Best Practices
The baozi application follows several best practices for writing effective and safe database migrations. Migrations are kept small and focused on single changes, making them easier to understand and test. All migrations are designed to be reversible, with careful consideration given to data preservation during rollback. Migration files include comprehensive comments explaining the purpose and impact of each change, and team members are encouraged to review migrations before deployment.

```mermaid
flowchart TD
Start([Migration Best Practices]) --> SmallMigrations["Keep migrations small and focused"]
SmallMigrations --> Reversible["Ensure all migrations are reversible"]
Reversible --> ComprehensiveComments["Include comprehensive comments"]
ComprehensiveComments --> PeerReview["Require peer review before deployment"]
PeerReview --> TestThoroughly["Test thoroughly in staging"]
TestThoroughly --> MonitorImpact["Monitor performance impact"]
MonitorImpact --> Complete["Best Practices Applied"]
```

**Section sources**
- [20231001032754-file-operation-paranoid.js](file://server/migrations/20231001032754-file-operation-paranoid.js#L1-L15)
- [20240810080954-group-users-remove-deleted-at.js](file://server/migrations/20240810080954-group-users-remove-deleted-at.js#L1-L40)