// @flow
import * as React from "react";
import { observer } from "mobx-react";
import { observable } from "mobx";
import styled from "styled-components";
import VisuallyHidden from "components/VisuallyHidden";
import { Outline, LabelText } from "./Input";

const Select = styled.select`
  border: 0;
  flex: 1;
  padding: 8px 12px;
  outline: none;
  background: none;
  color: ${props => props.theme.text};

  &:disabled,
  &::placeholder {
    color: ${props => props.theme.placeholder};
  }
`;

type Option = { label: string, value: string };

export type Props = {
  value?: string,
  label?: string,
  className?: string,
  labelHidden?: boolean,
  options: Option[],
};

@observer
class InputSelect extends React.Component<Props> {
  @observable focused: boolean = false;

  handleBlur = () => {
    this.focused = false;
  };

  handleFocus = () => {
    this.focused = true;
  };

  render() {
    const { label, className, labelHidden, options, ...rest } = this.props;

    const wrappedLabel = <LabelText>{label}</LabelText>;

    return (
      <label>
        {label &&
          (labelHidden ? (
            <VisuallyHidden>{wrappedLabel}</VisuallyHidden>
          ) : (
            wrappedLabel
          ))}
        <Outline focused={this.focused} className={className}>
          <Select onBlur={this.handleBlur} onFocus={this.handleFocus} {...rest}>
            {options.map(option => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Outline>
      </label>
    );
  }
}

export default InputSelect;
