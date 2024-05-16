import { isEmail } from "class-validator";
import { m } from "framer-motion";
import { observer } from "mobx-react";
import { BackIcon, LinkIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DocumentPermission, UserRole } from "@shared/types";
import Document from "~/models/Document";
import Share from "~/models/Share";
import Avatar from "~/components/Avatar";
import { AvatarSize } from "~/components/Avatar/Avatar";
import ButtonSmall from "~/components/ButtonSmall";
import CopyToClipboard from "~/components/CopyToClipboard";
import NudeButton from "~/components/NudeButton";
import Tooltip from "~/components/Tooltip";
import { createAction } from "~/actions";
import { UserSection } from "~/actions/sections";
import useActionContext from "~/hooks/useActionContext";
import useBoolean from "~/hooks/useBoolean";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import useKeyDown from "~/hooks/useKeyDown";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import { documentPath, urlify } from "~/utils/routeHelpers";
import { Separator, Wrapper, presence } from "../components";
import { SearchInput } from "../components/SearchInput";
import { Suggestions } from "../components/Suggestions";
import DocumentMembersList from "./DocumentMemberList";
import { OtherAccess } from "./OtherAccess";
import PublicAccess from "./PublicAccess";

type Props = {
  /** The document to share. */
  document: Document;
  /** The existing share model, if any. */
  share: Share | null | undefined;
  /** The existing share parent model, if any. */
  sharedParent: Share | null | undefined;
  /** Callback fired when the popover requests to be closed. */
  onRequestClose: () => void;
  /** Whether the popover is visible. */
  visible: boolean;
};

function SharePopover({
  document,
  share,
  sharedParent,
  onRequestClose,
  visible,
}: Props) {
  const team = useCurrentTeam();
  const { t } = useTranslation();
  const can = usePolicy(document);
  const linkButtonRef = React.useRef<HTMLButtonElement>(null);
  const context = useActionContext();
  const [hasRendered, setHasRendered] = React.useState(visible);
  const { users, userMemberships } = useStores();
  const [query, setQuery] = React.useState("");
  const [picker, showPicker, hidePicker] = useBoolean();
  const timeout = React.useRef<ReturnType<typeof setTimeout>>();
  const [invitedInSession, setInvitedInSession] = React.useState<string[]>([]);
  const [pendingIds, setPendingIds] = React.useState<string[]>([]);
  const collectionSharingDisabled = document.collection?.sharing === false;

  useKeyDown(
    "Escape",
    (ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();

      if (picker) {
        hidePicker();
      } else {
        onRequestClose();
      }
    },
    {
      allowInInput: true,
    }
  );

  // Fetch sharefocus the link button when the popover is opened
  React.useEffect(() => {
    if (visible) {
      void document.share();
      setHasRendered(true);
    }
  }, [document, hidePicker, visible]);

  // Hide the picker when the popover is closed
  React.useEffect(() => {
    if (visible) {
      setPendingIds([]);
      hidePicker();
    }
  }, [hidePicker, visible]);

  // Clear the query when picker is closed
  React.useEffect(() => {
    if (!picker) {
      setQuery("");
    }
  }, [picker]);

  const handleCopied = React.useCallback(() => {
    onRequestClose();

    timeout.current = setTimeout(() => {
      toast.message(t("Link copied to clipboard"));
    }, 100);

    return () => {
      if (timeout.current) {
        clearTimeout(timeout.current);
      }
    };
  }, [onRequestClose, t]);

  const inviteAction = React.useMemo(
    () =>
      createAction({
        name: t("Invite"),
        section: UserSection,
        perform: async () => {
          const usersInvited = await Promise.all(
            pendingIds.map(async (idOrEmail) => {
              let user;

              // convert email to user
              if (isEmail(idOrEmail)) {
                const response = await users.invite([
                  {
                    email: idOrEmail,
                    name: idOrEmail,
                    role: team.defaultUserRole,
                  },
                ]);
                user = response.users[0];
              } else {
                user = users.get(idOrEmail);
              }

              if (!user) {
                return;
              }

              await userMemberships.create({
                documentId: document.id,
                userId: user.id,
                permission:
                  user?.role === UserRole.Viewer ||
                  user?.role === UserRole.Guest
                    ? DocumentPermission.Read
                    : DocumentPermission.ReadWrite,
              });

              return user;
            })
          );

          if (usersInvited.length === 1) {
            const user = usersInvited[0];
            toast.message(
              t("{{ userName }} was invited to the document", {
                userName: user.name,
              }),
              {
                icon: <Avatar model={user} size={AvatarSize.Toast} />,
              }
            );
          } else {
            toast.success(
              t("{{ count }} people invited to the document", {
                count: pendingIds.length,
              })
            );
          }

          setInvitedInSession((prev) => [...prev, ...pendingIds]);
          setPendingIds([]);
          hidePicker();
        },
      }),
    [
      t,
      pendingIds,
      hidePicker,
      userMemberships,
      document.id,
      users,
      team.defaultUserRole,
    ]
  );

  const handleQuery = React.useCallback(
    (event) => {
      showPicker();
      setQuery(event.target.value);
    },
    [showPicker, setQuery]
  );

  const handleAddPendingId = React.useCallback(
    (id: string) => {
      setPendingIds((prev) => [...prev, id]);
    },
    [setPendingIds]
  );

  const handleRemovePendingId = React.useCallback(
    (id: string) => {
      setPendingIds((prev) => prev.filter((i) => i !== id));
    },
    [setPendingIds]
  );

  if (!hasRendered) {
    return null;
  }

  const backButton = (
    <>
      {picker && (
        <NudeButton
          key="back"
          as={m.button}
          {...presence}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            hidePicker();
          }}
        >
          <BackIcon />
        </NudeButton>
      )}
    </>
  );

  const rightButton = picker ? (
    pendingIds.length ? (
      <ButtonSmall action={inviteAction} context={context} key="invite">
        {t("Invite")}
      </ButtonSmall>
    ) : null
  ) : (
    <Tooltip
      content={t("Copy link")}
      delay={500}
      placement="top"
      key="copy-link"
    >
      <CopyToClipboard
        text={urlify(documentPath(document))}
        onCopy={handleCopied}
      >
        <NudeButton type="button" disabled={!share} ref={linkButtonRef}>
          <LinkIcon size={20} />
        </NudeButton>
      </CopyToClipboard>
    </Tooltip>
  );

  return (
    <Wrapper>
      {can.manageUsers && (
        <SearchInput
          onChange={handleQuery}
          onClick={showPicker}
          query={query}
          back={backButton}
          action={rightButton}
        />
      )}

      {picker && (
        <div>
          <Suggestions
            document={document}
            query={query}
            pendingIds={pendingIds}
            addPendingId={handleAddPendingId}
            removePendingId={handleRemovePendingId}
          />
        </div>
      )}

      <div style={{ display: picker ? "none" : "block" }}>
        <OtherAccess document={document}>
          <DocumentMembersList
            document={document}
            invitedInSession={invitedInSession}
          />
        </OtherAccess>

        {team.sharing && can.share && !collectionSharingDisabled && (
          <>
            {document.members.length ? <Separator /> : null}
            <PublicAccess
              document={document}
              share={share}
              sharedParent={sharedParent}
              onRequestClose={onRequestClose}
            />
          </>
        )}
      </div>
    </Wrapper>
  );
}

export default observer(SharePopover);
