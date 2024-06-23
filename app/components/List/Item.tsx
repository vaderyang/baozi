import {
  useFocusEffect,
  useRovingTabIndex,
} from "@getoutline/react-roving-tabindex";
import { LocationDescriptor } from "history";
import * as React from "react";
import styled, { useTheme } from "styled-components";
import { s, ellipsis } from "@shared/styles";
import Flex from "~/components/Flex";
import NavLink from "~/components/NavLink";
import { hover } from "~/styles";

export type Props = Omit<React.HTMLAttributes<HTMLAnchorElement>, "title"> & {
  /** An icon or image to display to the left of the list item */
  image?: React.ReactNode;
  /** An internal location to navigate to on click, if provided the list item will have hover styles */
  to?: LocationDescriptor;
  /** An optional click handler, if provided the list item will have hover styles */
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  /** An optional keydown handler, if provided the list item will have hover styles */
  onKeyDown?: React.KeyboardEventHandler<HTMLAnchorElement>;
  /** Whether to match the location exactly */
  exact?: boolean;
  /** The title of the list item */
  title: React.ReactNode;
  /** The subtitle of the list item, displayed below the title */
  subtitle?: React.ReactNode;
  /** Actions to display to the right of the list item */
  actions?: React.ReactNode;
  /** Whether to display a border below the list item */
  border?: boolean;
  /** Whether to display the list item in a compact style */
  small?: boolean;
  /** Whether to enable keyboard navigation */
  keyboardNavigation?: boolean;
};

const ListItem = (
  {
    image,
    title,
    subtitle,
    actions,
    small,
    border,
    to,
    keyboardNavigation,
    ...rest
  }: Props,
  ref?: React.Ref<HTMLAnchorElement>
) => {
  const theme = useTheme();
  const compact = !subtitle;

  let itemRef: React.Ref<HTMLAnchorElement> =
    React.useRef<HTMLAnchorElement>(null);
  if (ref) {
    itemRef = ref;
  }

  const { focused, ...rovingTabIndex } = useRovingTabIndex(
    itemRef as React.RefObject<HTMLAnchorElement>,
    keyboardNavigation || to ? false : true
  );
  useFocusEffect(focused, itemRef as React.RefObject<HTMLAnchorElement>);

  const content = (selected: boolean) => (
    <>
      {image && <Image>{image}</Image>}
      <Content
        justify={compact ? "center" : undefined}
        column={!compact}
        $selected={selected}
      >
        <Heading $small={small}>{title}</Heading>
        {subtitle && (
          <Subtitle $small={small} $selected={selected}>
            {subtitle}
          </Subtitle>
        )}
      </Content>
      {actions && (
        <Actions $selected={selected} gap={4}>
          {actions}
        </Actions>
      )}
    </>
  );

  if (to) {
    return (
      <Wrapper
        ref={itemRef}
        $border={border}
        $small={small}
        activeStyle={{
          background: theme.accent,
        }}
        {...rest}
        {...rovingTabIndex}
        onClick={(ev) => {
          if (rest.onClick) {
            rest.onClick(ev);
          }
          rovingTabIndex.onClick(ev);
        }}
        onKeyDown={(ev) => {
          if (rest.onKeyDown) {
            rest.onKeyDown(ev);
          }
          rovingTabIndex.onKeyDown(ev);
        }}
        as={NavLink}
        to={to}
      >
        {content}
      </Wrapper>
    );
  }

  return (
    <Wrapper
      ref={itemRef}
      $border={border}
      $small={small}
      $hover={!!rest.onClick}
      {...rest}
      {...rovingTabIndex}
      onClick={(ev) => {
        rest.onClick?.(ev);
        rovingTabIndex.onClick(ev);
      }}
      onKeyDown={(ev) => {
        rest.onKeyDown?.(ev);
        rovingTabIndex.onKeyDown(ev);
      }}
    >
      {content(false)}
    </Wrapper>
  );
};

const Wrapper = styled.a<{
  $small?: boolean;
  $border?: boolean;
  $hover?: boolean;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  to?: LocationDescriptor;
}>`
  display: flex;
  padding: ${(props) => (props.$border === false ? 0 : "8px 0")};
  min-height: 32px;
  margin: ${(props) =>
    props.$border === false ? (props.$small ? "8px 0" : "16px 0") : 0};
  border-bottom: 1px solid
    ${(props) =>
      props.$border === false ? "transparent" : props.theme.divider};

  &:last-child {
    border-bottom: 0;
  }

  &:focus-visible {
    outline: none;
  }

  &:${hover},
  &:focus,
  &:focus-within {
    background: ${(props) =>
      props.$hover ? props.theme.secondaryBackground : "inherit"};
  }

  cursor: ${(props) =>
    props.to || props.onClick ? "var(--pointer)" : "default"};
`;

const Image = styled(Flex)`
  padding: 0 8px 0 0;
  max-height: 32px;
  align-items: center;
  user-select: none;
  flex-shrink: 0;
  align-self: center;
  color: ${s("text")};
`;

const Heading = styled.p<{ $small?: boolean }>`
  font-size: ${(props) => (props.$small ? 14 : 16)}px;
  font-weight: 500;
  ${ellipsis()}
  line-height: ${(props) => (props.$small ? 1.3 : 1.2)};
  margin: 0;
`;

const Content = styled(Flex)<{ $selected: boolean }>`
  flex-direction: column;
  flex-grow: 1;
  color: ${(props) => (props.$selected ? props.theme.white : props.theme.text)};
`;

const Subtitle = styled.p<{ $small?: boolean; $selected?: boolean }>`
  margin: 0;
  font-size: ${(props) => (props.$small ? 13 : 14)}px;
  color: ${(props) =>
    props.$selected ? props.theme.white50 : props.theme.textTertiary};
  margin-top: -2px;
`;

export const Actions = styled(Flex)<{ $selected?: boolean }>`
  align-self: center;
  justify-content: center;
  flex-shrink: 0;
  color: ${(props) =>
    props.$selected ? props.theme.white : props.theme.textSecondary};
`;

export default React.forwardRef(ListItem);
