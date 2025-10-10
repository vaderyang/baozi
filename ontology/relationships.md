# 关系与约束（Relationships & Constraints）

仅列核心关系、基数与关键约束。更详细参考 `server/models/*`。

- **Team — User**
  - 关系：`Team (1) ── (N) User`
  - 约束：`User.teamId` 必填；团队可挂起（`Team.suspendedAt`）影响用户可用性。

- **Team — Collection / Document / Group / AuthenticationProvider / Integration / Attachment**
  - 关系：`Team (1) ── (N)` 对应实体
  - 约束：均带 `teamId` 外键，遵循软删除/挂起规则。

- **Collection — Document**
  - 关系：`Collection (1) ── (N) Document`
  - 约束：文档可为空集合（模板/草稿）；集合持有 `documentStructure` 用于导航。

- **Document — Document（父子）**
  - 关系：`Document (1) ── (N) Document`（自关联：`parentDocumentId`）
  - 约束：禁止循环（见 `Document.checkParentDocument`）。

- **Document — Revision**
  - 关系：`Document (1) ── (N) Revision`
  - 约束：修订记录文档变更快照；删除修订前会清理数据体量（`BeforeDestroy`）。

- **授权（Membership）**
  - `UserMembership`：User 对 Collection/Document 的授权。
  - `GroupMembership`：Group 对 Collection/Document 的授权。
  - 关系：
    - `Collection (1) ── (N) UserMembership`，`Collection (1) ── (N) GroupMembership`
    - `Document (1) ── (N) UserMembership`，`Document (1) ── (N) GroupMembership`
  - 约束：
    - 管理权限保底：集合至少保留一个 `Admin`（见 `checkLastAdminBefore*`）。
    - 授权派生：父文档授权通过 `sourceId` 派生到子文档（`recreateSourcedMemberships`）。

- **User — Group（成员关系）**
  - 关系：`Group (N) ── (N) User`（经 `GroupUser`）
  - 约束：`Group.filterByMember` 用于基于用户过滤分组可见性。

- **Share（分享）**
  - 关系：
    - `Share ─→ Team`（必选）
    - `Share ─→ User`（创建者）
    - `Share ─→ Collection? / Document?`（二选一或为空）
  - 约束：自定义 `domain` 不得与现有 `Team.domain` 冲突；支持撤销（`revoke`）。

- **互动**
  - `View`：`User (N) ── (N) Document` 上的视图计数（通过主键对每对唯一）。
  - `Star`：用户收藏（目标为 `Document` 或 `Collection`）。
  - `Pin`：团队范围置顶（目标通常为 `Document`，可选 `Collection`）。

- **Attachment（附件）**
  - 关系：`Attachment ─→ Team`（必选），`Attachment ─→ Document?`，`Attachment ─→ User`
  - 约束：`key` 不可修改；删除时清理存储；私有与公有 ACL。

- **集成与鉴权**
  - `ApiKey ─→ User`
  - `AuthenticationProvider ─→ Team`
  - `Integration ─→ Team`，`Integration ─→ Collection?`，`Integration ─→ IntegrationAuthentication`
  - 约束：团队至少保留一个启用的认证提供方（`AuthenticationProvider.disable` 检查）。
