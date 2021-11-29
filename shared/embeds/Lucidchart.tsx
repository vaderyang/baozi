import * as React from "react";
import Frame from "./components/Frame";

type Props = {
  attrs: {
    href: string;
    matches: Record<string, any>;
  };
};

export default class Lucidchart extends React.Component<Props> {
  static ENABLED = [
    /^https?:\/\/(www\.|app\.)?lucidchart.com\/documents\/(embeddedchart|view)\/(?<chartId>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\/.*)?$/,
    /^https?:\/\/(www\.|app\.)?lucid.app\/lucidchart\/(?<chartId>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\/(embeddedchart|view)(?:\/.*)?$/,
  ];

  render() {
    const { matches } = this.props.attrs;
    const { chartId } = matches.groups;
    return (
      <Frame
        {...this.props}
        // @ts-expect-error ts-migrate(2322) FIXME: Type '{ src: string; title: string; attrs: { href:... Remove this comment to see the full error message
        src={`https://lucidchart.com/documents/embeddedchart/${chartId}`}
        title="Lucidchart Embed"
      />
    );
  }
}
