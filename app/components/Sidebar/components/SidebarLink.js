// @flow
import * as React from "react";
import { withRouter, NavLink } from "react-router-dom";
import styled, { withTheme } from "styled-components";
import { type Theme } from "types";

type Props = {
  to?: string | Object,
  href?: string | Object,
  innerRef?: (?HTMLElement) => void,
  onClick?: (SyntheticEvent<>) => void,
  onMouseEnter?: (SyntheticEvent<>) => void,
  children?: React.Node,
  icon?: React.Node,
  label?: React.Node,
  menu?: React.Node,
  menuOpen?: boolean,
  iconColor?: string,
  active?: boolean,
  theme: Theme,
  exact?: boolean,
  depth?: number,
};

function SidebarLink({
  icon,
  children,
  onClick,
  onMouseEnter,
  to,
  label,
  active,
  menu,
  menuOpen,
  theme,
  exact,
  href,
  innerRef,
  depth,
  ...rest
}: Props) {
  const style = React.useMemo(() => {
    return {
      paddingLeft: `${(depth || 0) * 16 + 16}px`,
    };
  }, [depth]);

  const activeStyle = {
    color: theme.text,
    fontWeight: 600,
    background: theme.sidebarItemBackground,
    ...style,
  };

  return (
    <StyledNavLink
      activeStyle={activeStyle}
      style={active ? activeStyle : style}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      exact={exact !== false}
      to={to}
      as={to ? undefined : href ? "a" : "div"}
      href={href}
      ref={innerRef}
    >
      {icon && <IconWrapper>{icon}</IconWrapper>}
      <Label>{label}</Label>
      {menu && <Action menuOpen={menuOpen}>{menu}</Action>}
    </StyledNavLink>
  );
}

// accounts for whitespace around icon
const IconWrapper = styled.span`
  margin-left: -4px;
  margin-right: 4px;
  height: 24px;
`;

const Action = styled.span`
  display: ${(props) => (props.menuOpen ? "inline" : "none")};
  position: absolute;
  top: 4px;
  right: 4px;
  color: ${(props) => props.theme.textTertiary};

  svg {
    opacity: 0.75;
  }

  &:hover {
    svg {
      opacity: 1;
    }
  }
`;

const StyledNavLink = styled(NavLink)`
  display: flex;
  position: relative;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 4px 16px;
  border-radius: 4px;
  color: ${(props) => props.theme.sidebarText};
  font-size: 15px;
  cursor: pointer;

  &:hover {
    color: ${(props) => props.theme.text};
  }

  &:focus {
    color: ${(props) => props.theme.text};
    background: ${(props) => props.theme.black05};
  }

  &:hover {
    > ${Action} {
      display: inline;
    }
  }
`;

const Label = styled.div`
  position: relative;
  width: 100%;
  max-height: 4.8em;
  line-height: 1.6;
`;

export default withRouter(withTheme(SidebarLink));
