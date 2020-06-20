// @flow
import * as React from "react";
import { observable } from "mobx";
import { observer } from "mobx-react";
import styled from "styled-components";
import distanceInWordsToNow from "date-fns/distance_in_words_to_now";
import Avatar from "components/Avatar";
import Tooltip from "components/Tooltip";
import User from "models/User";
import UserProfile from "scenes/UserProfile";
import { EditIcon } from "outline-icons";

type Props = {
  user: User,
  isPresent: boolean,
  isEditing: boolean,
  isCurrentUser: boolean,
  lastViewedAt: string,
};

@observer
class AvatarWithPresence extends React.Component<Props> {
  @observable isOpen: boolean = false;

  handleOpenProfile = () => {
    this.isOpen = true;
  };

  handleCloseProfile = () => {
    this.isOpen = false;
  };

  render() {
    const {
      user,
      lastViewedAt,
      isPresent,
      isEditing,
      isCurrentUser,
    } = this.props;

    return (
      <React.Fragment>
        <Tooltip
          tooltip={
            <Centered>
              <strong>{user.name}</strong> {isCurrentUser && "(You)"}
              <br />
              {isPresent
                ? isEditing ? "currently editing" : "currently viewing"
                : `viewed ${distanceInWordsToNow(new Date(lastViewedAt))} ago`}
            </Centered>
          }
          placement="bottom"
        >
          <AvatarWrapper isPresent={isPresent}>
            <Avatar
              src={user.avatarUrl}
              onClick={this.handleOpenProfile}
              size={32}
              icon={isEditing ? <EditIcon size={16} color="#FFF" /> : undefined}
            />
          </AvatarWrapper>
        </Tooltip>
        <UserProfile
          user={user}
          isOpen={this.isOpen}
          onRequestClose={this.handleCloseProfile}
        />
      </React.Fragment>
    );
  }
}

const Centered = styled.div`
  text-align: center;
`;

const AvatarWrapper = styled.div`
  opacity: ${props => (props.isPresent ? 1 : 0.5)};
  transition: opacity 250ms ease-in-out;
`;

export default AvatarWithPresence;
