import { Context } from "koa";
import { RouterContext } from "koa-router";
import { Client } from "@shared/types";
import { AccountProvisionerResult } from "./commands/accountProvisioner";
import { FileOperation, Team, User } from "./models";

export enum AuthenticationType {
  API = "api",
  APP = "app",
}

export type AuthenticationResult = AccountProvisionerResult & {
  client: Client;
};

export type AuthenticatedState = {
  user: User;
  token: string;
  authType: AuthenticationType;
};

export type ContextWithState = Context & {
  state: AuthenticatedState;
};

export interface APIContext<ReqT = Record<string, unknown>>
  extends RouterContext<AuthenticatedState, Context> {
  input: ReqT;
}

type BaseEvent = {
  teamId: string;
  actorId: string;
  ip: string;
};

export type ApiKeyEvent = BaseEvent & {
  name: "api_keys.create" | "api_keys.delete";
  modelId: string;
  data: {
    name: string;
  };
};

export type AttachmentEvent = BaseEvent &
  (
    | {
        name: "attachments.create";
        modelId: string;
        data: {
          name: string;
          source: string;
        };
      }
    | {
        name: "attachments.delete";
        modelId: string;
        data: {
          name: string;
        };
      }
  );

export type AuthenticationProviderEvent = BaseEvent & {
  name: "authenticationProviders.update";
  modelId: string;
  data: {
    enabled: boolean;
  };
};

export type UserEvent = BaseEvent &
  (
    | {
        name:
          | "users.signin"
          | "users.signout"
          | "users.update"
          | "users.suspend"
          | "users.activate"
          | "users.delete";
        userId: string;
      }
    | {
        name: "users.create" | "users.promote" | "users.demote";
        userId: string;
        data: {
          name: string;
        };
      }
    | {
        name: "users.invite";
        userId: string;
        data: {
          email: string;
          name: string;
        };
      }
  );

export type DocumentEvent = BaseEvent &
  (
    | {
        name:
          | "documents.create"
          | "documents.publish"
          | "documents.unpublish"
          | "documents.delete"
          | "documents.permanent_delete"
          | "documents.archive"
          | "documents.unarchive"
          | "documents.restore";
        documentId: string;
        collectionId: string;
        data: {
          title: string;
          source?: "import";
        };
      }
    | {
        name: "documents.move";
        documentId: string;
        collectionId: string;
        data: {
          collectionIds: string[];
          documentIds: string[];
        };
      }
    | {
        name:
          | "documents.update"
          | "documents.update.delayed"
          | "documents.update.debounced";
        documentId: string;
        collectionId: string;
        createdAt: string;
        data: {
          title: string;
          autosave: boolean;
          done: boolean;
        };
      }
    | {
        name: "documents.title_change";
        documentId: string;
        collectionId: string;
        createdAt: string;
        data: {
          title: string;
          previousTitle: string;
        };
      }
  );

export type RevisionEvent = BaseEvent & {
  name: "revisions.create";
  documentId: string;
  collectionId: string;
  modelId: string;
};

export type FileOperationEvent = BaseEvent & {
  name:
    | "fileOperations.create"
    | "fileOperations.update"
    | "fileOperations.delete";
  modelId: string;
  data: Partial<FileOperation>;
};

export type CollectionUserEvent = BaseEvent & {
  name: "collections.add_user" | "collections.remove_user";
  userId: string;
  collectionId: string;
};

export type CollectionGroupEvent = BaseEvent & {
  name: "collections.add_group" | "collections.remove_group";
  collectionId: string;
  modelId: string;
  data: {
    name: string;
  };
};

export type CollectionEvent = BaseEvent &
  (
    | CollectionUserEvent
    | CollectionGroupEvent
    | {
        name:
          | "collections.create"
          | "collections.update"
          | "collections.delete";
        collectionId: string;
        data: {
          name: string;
        };
      }
    | {
        name: "collections.move";
        collectionId: string;
        data: {
          index: string;
        };
      }
    | {
        name: "collections.permission_changed";
        collectionId: string;
        data: {
          privacyChanged: boolean;
          sharingChanged: boolean;
        };
      }
  );

export type GroupUserEvent = BaseEvent & {
  name: "groups.add_user" | "groups.remove_user";
  userId: string;
  modelId: string;
  data: {
    name: string;
  };
};

export type GroupEvent = BaseEvent &
  (
    | GroupUserEvent
    | {
        name: "groups.create" | "groups.delete" | "groups.update";
        modelId: string;
        data: {
          name: string;
        };
      }
  );

export type IntegrationEvent = BaseEvent & {
  name: "integrations.create" | "integrations.update";
  modelId: string;
};

export type TeamEvent = BaseEvent & {
  name: "teams.create" | "teams.update";
  data: Partial<Team>;
};

export type PinEvent = BaseEvent & {
  name: "pins.create" | "pins.update" | "pins.delete";
  modelId: string;
  documentId: string;
  collectionId?: string;
};

export type StarEvent = BaseEvent & {
  name: "stars.create" | "stars.update" | "stars.delete";
  modelId: string;
  documentId: string;
  userId: string;
};

export type ShareEvent = BaseEvent & {
  name: "shares.create" | "shares.update" | "shares.revoke";
  modelId: string;
  documentId: string;
  collectionId?: string;
  data: {
    name: string;
  };
};

export type SubscriptionEvent = BaseEvent & {
  name: "subscriptions.create" | "subscriptions.delete";
  modelId: string;
  userId: string;
  documentId: string | null;
};

export type ViewEvent = BaseEvent & {
  name: "views.create";
  documentId: string;
  collectionId: string;
  modelId: string;
  data: {
    title: string;
  };
};

export type WebhookSubscriptionEvent = BaseEvent & {
  name:
    | "webhookSubscriptions.create"
    | "webhookSubscriptions.delete"
    | "webhookSubscriptions.update";
  modelId: string;
  data: {
    name: string;
    url: string;
    events: string[];
  };
};

export type Event =
  | ApiKeyEvent
  | AttachmentEvent
  | AuthenticationProviderEvent
  | DocumentEvent
  | PinEvent
  | StarEvent
  | CollectionEvent
  | FileOperationEvent
  | IntegrationEvent
  | GroupEvent
  | RevisionEvent
  | ShareEvent
  | SubscriptionEvent
  | TeamEvent
  | UserEvent
  | ViewEvent
  | WebhookSubscriptionEvent;

export type NotificationMetadata = {
  notificationId?: string;
};
