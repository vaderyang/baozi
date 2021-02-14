// @flow
import * as React from "react";
import { NavLink } from "react-router-dom";
import styled, { withTheme } from "styled-components";
import { type Theme } from "types";

type Props = {
  theme: Theme,
};

const TabLink = styled(NavLink)`
  position: relative;
  display: inline-flex;
  align-items: center;
  font-weight: 500;
  font-size: 14px;
  color: ${(props) => props.theme.textTertiary};
  margin-right: 24px;
  padding: 6px 0;

  &:hover {
    color: ${(props) => props.theme.textSecondary};
    border-bottom: 3px solid ${(props) => props.theme.divider};
    padding-bottom: 5px;
  }
`;

function Tab({ theme, ...rest }: Props) {
  const activeStyle = {
    paddingBottom: "5px",
    borderBottom: `3px solid ${theme.textSecondary}`,
    color: theme.textSecondary,
  };

  return <TabLink {...rest} activeStyle={activeStyle} />;
}

export default withTheme(Tab);
