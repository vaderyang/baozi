import { ReactionIcon } from "outline-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { PopoverDisclosure, usePopoverState } from "reakit";
import styled from "styled-components";
import Flex from "~/components/Flex";
import NudeButton from "~/components/NudeButton";
import PlaceholderText from "~/components/PlaceholderText";
import Popover from "~/components/Popover";
import useMobile from "~/hooks/useMobile";
import useOnClickOutside from "~/hooks/useOnClickOutside";
import useWindowSize from "~/hooks/useWindowSize";

const EmojiPanel = React.lazy(
  () => import("~/components/IconPicker/components/EmojiPanel")
);

type Props = {
  /** Callback when an emoji is selected by the user. */
  onSelect: (emoji: string) => Promise<void>;
  /** Callback when the picker is opened. */
  onOpen?: () => void;
  /** Callback when the picker is closed. */
  onClose?: () => void;
  /** Optional classname. */
  className?: string;
  size?: number;
};

const ReactionPicker: React.FC<Props> = ({
  onSelect,
  onOpen,
  onClose,
  className,
  size,
}) => {
  const { t } = useTranslation();
  const popover = usePopoverState({
    modal: true,
    unstable_offset: [0, 0],
    placement: "bottom-end",
  });

  const { width: windowWidth } = useWindowSize();
  const isMobile = useMobile();

  const [query, setQuery] = React.useState("");
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  const popoverWidth = isMobile ? windowWidth : 300;
  // In mobile, popover is absolutely positioned to leave 8px on both sides.
  const panelWidth = isMobile ? windowWidth - 16 : popoverWidth;
  const { toggle, hide } = popover;
  const handlePopoverButtonClick = React.useCallback(
    (ev: React.MouseEvent) => {
      ev.stopPropagation();
      toggle();
    },
    [toggle]
  );

  const handleEmojiSelect = React.useCallback(
    (emoji: string) => {
      hide();
      void onSelect(emoji);
    },
    [hide, onSelect]
  );

  // Popover open effect
  React.useEffect(() => {
    if (popover.visible) {
      onOpen?.();
    } else {
      onClose?.();
    }
  }, [popover.visible, onOpen, onClose]);

  // Custom click outside handling rather than using `hideOnClickOutside` from reakit so that we can
  // prevent event bubbling.
  useOnClickOutside(
    contentRef,
    (event) => {
      if (
        popover.visible &&
        !popover.unstable_disclosureRef.current?.contains(event.target as Node)
      ) {
        event.stopPropagation();
        event.preventDefault();
        popover.hide();
      }
    },
    { capture: true }
  );

  return (
    <>
      <PopoverDisclosure {...popover}>
        {(props) => (
          <PopoverButton
            {...props}
            aria-label={t("Reaction picker")}
            className={className}
            onClick={handlePopoverButtonClick}
            size={size}
          >
            <ReactionIcon size={22} />
          </PopoverButton>
        )}
      </PopoverDisclosure>
      <Popover
        {...popover}
        ref={contentRef}
        width={popoverWidth}
        shrink
        aria-label={t("Reaction picker")}
        onClick={(e) => e.stopPropagation()}
        hideOnClickOutside={false}
      >
        {popover.visible && (
          <React.Suspense fallback={<Placeholder />}>
            <ScrollableContainer>
              <EmojiPanel
                panelWidth={panelWidth}
                query={query}
                panelActive={true}
                onEmojiChange={handleEmojiSelect}
                onQueryChange={setQuery}
              />
            </ScrollableContainer>
          </React.Suspense>
        )}
      </Popover>
    </>
  );
};

const Placeholder = React.memo(
  () => (
    <Flex column gap={6} style={{ height: "300px", padding: "6px 12px" }}>
      <Flex gap={8}>
        <PlaceholderText height={32} minWidth={90} />
        <PlaceholderText height={32} width={32} />
      </Flex>
      <PlaceholderText height={24} width={120} />
    </Flex>
  ),
  () => true
);
Placeholder.displayName = "ReactionPickerPlaceholder";

const ScrollableContainer = styled.div`
  height: 300px;
  overflow-y: auto;
`;

const PopoverButton = styled(NudeButton)`
  border-radius: 50%;
`;

export default ReactionPicker;
