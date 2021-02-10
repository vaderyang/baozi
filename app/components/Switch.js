// @flow
import * as React from "react";
import styled from "styled-components";
import { LabelText } from "components/Input";

type Props = {|
  width?: number,
  height?: number,
  label?: string,
  checked?: boolean,
  disabled?: boolean,
  onChange: (event: SyntheticInputEvent<HTMLInputElement>) => mixed,
  id?: string,
|};

function Switch({ width = 38, height = 20, label, disabled, ...props }: Props) {
  const component = (
    <Wrapper width={width} height={height}>
      <HiddenInput
        type="checkbox"
        width={width}
        height={height}
        disabled={disabled}
        {...props}
      />
      <Slider width={width} height={height} />
    </Wrapper>
  );

  if (label) {
    return (
      <Label disabled={disabled} htmlFor={props.id}>
        {component}
        <LabelText>{label}</LabelText>
      </Label>
    );
  }

  return component;
}

const Label = styled.label`
  display: flex;
  align-items: center;

  ${(props) => (props.disabled ? `opacity: 0.75;` : "")}
`;

const Wrapper = styled.label`
  position: relative;
  display: inline-block;
  width: ${(props) => props.width}px;
  height: ${(props) => props.height}px;
  margin-bottom: 4px;
  margin-right: 8px;
`;

const Slider = styled.span`
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${(props) => props.theme.slate};
  -webkit-transition: 0.4s;
  transition: 0.4s;
  border-radius: ${(props) => props.height}px;

  &:before {
    position: absolute;
    content: "";
    height: ${(props) => props.height - 8}px;
    width: ${(props) => props.height - 8}px;
    left: 4px;
    bottom: 4px;
    background-color: white;
    border-radius: 50%;
    -webkit-transition: 0.4s;
    transition: 0.4s;
  }
`;

const HiddenInput = styled.input`
  opacity: 0;
  width: 0;
  height: 0;
  visibility: hidden;

  &:disabled + ${Slider} {
    opacity: 0.75;
    cursor: default;
  }

  &:checked + ${Slider} {
    background-color: ${(props) => props.theme.primary};
  }

  &:focus + ${Slider} {
    box-shadow: 0 0 1px ${(props) => props.theme.primary};
  }

  &:checked + ${Slider}:before {
    transform: translateX(${(props) => props.width - props.height}px);
  }
`;

export default Switch;
