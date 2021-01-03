// @flow
import { observable } from "mobx";
import { inject, observer } from "mobx-react";
import * as React from "react";
import { withRouter, type RouterHistory } from "react-router-dom";
import { groupSettings } from "shared/utils/routeHelpers";
import UiStore from "stores/UiStore";
import Group from "models/Group";
import Button from "components/Button";
import Flex from "components/Flex";
import HelpText from "components/HelpText";

type Props = {
  history: RouterHistory,
  group: Group,
  ui: UiStore,
  onSubmit: () => void,
};

@observer
class GroupDelete extends React.Component<Props> {
  @observable isDeleting: boolean;

  handleSubmit = async (ev: SyntheticEvent<>) => {
    ev.preventDefault();
    this.isDeleting = true;

    try {
      await this.props.group.delete();
      this.props.history.push(groupSettings());
      this.props.onSubmit();
    } catch (err) {
      this.props.ui.showToast(err.message, { type: "error" });
    } finally {
      this.isDeleting = false;
    }
  };

  render() {
    const { group } = this.props;

    return (
      <Flex column>
        <form onSubmit={this.handleSubmit}>
          <HelpText>
            Are you sure about that? Deleting the <strong>{group.name}</strong>{" "}
            group will cause its members to lose access to collections and
            documents that it is associated with.
          </HelpText>
          <Button type="submit" danger>
            {this.isDeleting ? "Deleting…" : "I’m sure – Delete"}
          </Button>
        </form>
      </Flex>
    );
  }
}

export default inject("ui")(withRouter(GroupDelete));
