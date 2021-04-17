// @flow
import * as React from "react";
import styled from "styled-components";
import SlackLogo from "../SlackLogo";
import GoogleLogo from "./GoogleLogo";
import MicrosoftLogo from "./MicrosoftLogo";

type Props = {|
  providerName: string,
  size?: number,
|};

function AuthLogo({ providerName, size = 16 }: Props) {
  switch (providerName) {
    case "slack":
      return (
        <Logo>
          <SlackLogo size={size} />
        </Logo>
      );
    case "google":
      return (
        <Logo>
          <GoogleLogo size={size} />
        </Logo>
      );
    case "azure":
      return (
        <Logo>
          <MicrosoftLogo size={size} />
        </Logo>
      );
    default:
      return null;
  }
}

const Logo = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
`;

export default AuthLogo;
