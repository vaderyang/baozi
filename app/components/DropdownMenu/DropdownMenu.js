// @flow
import invariant from "invariant";
import { observable } from "mobx";
import { observer } from "mobx-react";
import { MoreIcon } from "outline-icons";
import { rgba } from "polished";
import * as React from "react";
import { withTranslation, type TFunction } from "react-i18next";
import { PortalWithState } from "react-portal";
import styled from "styled-components";
import { fadeAndScaleIn } from "shared/styles/animations";
import Flex from "components/Flex";
import NudeButton from "components/NudeButton";

let previousClosePortal;
let counter = 0;

type Children =
  | React.Node
  | ((options: { closePortal: () => void }) => React.Node);

type Props = {|
  label?: React.Node,
  onOpen?: () => void,
  onClose?: () => void,
  children?: Children,
  className?: string,
  hover?: boolean,
  style?: Object,
  position?: "left" | "right" | "center",
  t: TFunction,
|};

@observer
class DropdownMenu extends React.Component<Props> {
  id: string = `menu${counter++}`;
  closeTimeout: TimeoutID;

  @observable top: ?number;
  @observable bottom: ?number;
  @observable right: ?number;
  @observable left: ?number;
  @observable position: "left" | "right" | "center";
  @observable fixed: ?boolean;
  @observable bodyRect: ClientRect;
  @observable labelRect: ClientRect;
  @observable dropdownRef: { current: null | HTMLElement } = React.createRef();
  @observable menuRef: { current: null | HTMLElement } = React.createRef();

  handleOpen = (
    openPortal: (SyntheticEvent<>) => void,
    closePortal: () => void
  ) => {
    return (ev: SyntheticMouseEvent<HTMLElement>) => {
      ev.preventDefault();
      const currentTarget = ev.currentTarget;
      invariant(document.body, "why you not here");

      if (currentTarget instanceof HTMLDivElement) {
        this.bodyRect = document.body.getBoundingClientRect();
        this.labelRect = currentTarget.getBoundingClientRect();
        this.top = this.labelRect.bottom - this.bodyRect.top;
        this.bottom = undefined;
        this.position = this.props.position || "left";

        if (currentTarget.parentElement) {
          const triggerParentStyle = getComputedStyle(
            currentTarget.parentElement
          );

          if (triggerParentStyle.position === "static") {
            this.fixed = true;
            this.top = this.labelRect.bottom;
          }
        }

        this.initPosition();

        // attempt to keep only one flyout menu open at once
        if (previousClosePortal && !this.props.hover) {
          previousClosePortal();
        }
        previousClosePortal = closePortal;
        openPortal(ev);
      }
    };
  };

  initPosition() {
    if (this.position === "left") {
      this.right =
        this.bodyRect.width - this.labelRect.left - this.labelRect.width;
    } else if (this.position === "center") {
      this.left = this.labelRect.left + this.labelRect.width / 2;
    } else {
      this.left = this.labelRect.left;
    }
  }

  onOpen = () => {
    if (typeof this.props.onOpen === "function") {
      this.props.onOpen();
    }
    this.fitOnTheScreen();
  };

  fitOnTheScreen() {
    if (!this.dropdownRef || !this.dropdownRef.current) return;
    const el = this.dropdownRef.current;

    const sticksOutPastBottomEdge =
      el.clientHeight + this.top > window.innerHeight;
    if (sticksOutPastBottomEdge) {
      this.top = undefined;
      this.bottom = this.fixed ? 0 : -1 * window.pageYOffset;
    } else {
      this.bottom = undefined;
    }

    if (this.position === "left" || this.position === "right") {
      const totalWidth =
        Math.sign(this.position === "left" ? -1 : 1) * el.offsetLeft +
        el.scrollWidth;
      const isVisible = totalWidth < window.innerWidth;

      if (!isVisible) {
        if (this.position === "right") {
          this.position = "left";
          this.left = undefined;
        } else if (this.position === "left") {
          this.position = "right";
          this.right = undefined;
        }
      }
    }

    this.initPosition();
    this.forceUpdate();
  }

  closeAfterTimeout = (closePortal: () => void) => () => {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
    }
    this.closeTimeout = setTimeout(closePortal, 500);
  };

  clearCloseTimeout = () => {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
    }
  };

  render() {
    const { className, hover, label, children, t } = this.props;

    return (
      <div className={className}>
        <PortalWithState
          onOpen={this.onOpen}
          onClose={this.props.onClose}
          closeOnOutsideClick
          closeOnEsc
        >
          {({ closePortal, openPortal, isOpen, portal }) => (
            <>
              <Label
                onMouseMove={hover ? this.clearCloseTimeout : undefined}
                onMouseOut={
                  hover ? this.closeAfterTimeout(closePortal) : undefined
                }
                onMouseEnter={
                  hover ? this.handleOpen(openPortal, closePortal) : undefined
                }
                onClick={
                  hover ? undefined : this.handleOpen(openPortal, closePortal)
                }
              >
                {label || (
                  <NudeButton
                    id={`${this.id}button`}
                    aria-label={t("More options")}
                    aria-haspopup="true"
                    aria-expanded={isOpen ? "true" : "false"}
                    aria-controls={this.id}
                  >
                    <MoreIcon />
                  </NudeButton>
                )}
              </Label>
              {portal(
                <Position
                  ref={this.dropdownRef}
                  position={this.position}
                  fixed={this.fixed}
                  top={this.top}
                  bottom={this.bottom}
                  left={this.left}
                  right={this.right}
                >
                  <Menu
                    ref={this.menuRef}
                    onMouseMove={hover ? this.clearCloseTimeout : undefined}
                    onMouseOut={
                      hover ? this.closeAfterTimeout(closePortal) : undefined
                    }
                    onClick={
                      typeof children === "function"
                        ? undefined
                        : (ev) => {
                            ev.stopPropagation();
                            closePortal();
                          }
                    }
                    style={this.props.style}
                    id={this.id}
                    aria-labelledby={`${this.id}button`}
                    role="menu"
                  >
                    {typeof children === "function"
                      ? children({ closePortal })
                      : children}
                  </Menu>
                </Position>
              )}
            </>
          )}
        </PortalWithState>
      </div>
    );
  }
}

const Label = styled(Flex).attrs({
  justify: "center",
  align: "center",
})`
  z-index: ${(props) => props.theme.depths.menu};
  cursor: pointer;
`;

const Position = styled.div`
  position: ${({ fixed }) => (fixed ? "fixed" : "absolute")};
  display: flex;
  ${({ left }) => (left !== undefined ? `left: ${left}px` : "")};
  ${({ right }) => (right !== undefined ? `right: ${right}px` : "")};
  ${({ top }) => (top !== undefined ? `top: ${top}px` : "")};
  ${({ bottom }) => (bottom !== undefined ? `bottom: ${bottom}px` : "")};
  max-height: 75%;
  z-index: ${(props) => props.theme.depths.menu};
  transform: ${(props) =>
    props.position === "center" ? "translateX(-50%)" : "initial"};
  pointer-events: none;
`;

const Menu = styled.div`
  animation: ${fadeAndScaleIn} 200ms ease;
  transform-origin: ${(props) => (props.left !== undefined ? "25%" : "75%")} 0;
  backdrop-filter: blur(10px);
  background: ${(props) => rgba(props.theme.menuBackground, 0.8)};
  border: ${(props) =>
    props.theme.menuBorder ? `1px solid ${props.theme.menuBorder}` : "none"};
  border-radius: 2px;
  padding: 0.5em 0;
  min-width: 180px;
  overflow: hidden;
  overflow-y: auto;
  box-shadow: ${(props) => props.theme.menuShadow};
  pointer-events: all;

  hr {
    margin: 0.5em 12px;
  }

  @media print {
    display: none;
  }
`;

export const Header = styled.h3`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: ${(props) => props.theme.sidebarText};
  letter-spacing: 0.04em;
  margin: 1em 12px 0.5em;
`;

export default withTranslation()<DropdownMenu>(DropdownMenu);
