import { computed } from "mobx";
import { CollectionPermission } from "@shared/types";
import BaseModel from "./BaseModel";

class Membership extends BaseModel {
  id: string;

  userId: string;

  collectionId: string;

  permission: CollectionPermission;

  @computed
  get isEditor(): boolean {
    return this.permission === CollectionPermission.ReadWrite;
  }
}

export default Membership;
