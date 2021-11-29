import { formatDistanceToNow } from "date-fns";
import * as React from "react";

const LocaleTime = React.lazy(
  () =>
    import(
      /* webpackChunkName: "locale-time" */
      "~/components/LocaleTime"
    )
);

type Props = React.ComponentProps<typeof LocaleTime>;

function Time(props: Props) {
  let content = formatDistanceToNow(Date.parse(props.dateTime), {
    addSuffix: props.addSuffix,
  });

  if (props.shorten) {
    content = content
      .replace("about", "")
      .replace("less than a minute ago", "just now")
      .replace("minute", "min");
  }

  return (
    <React.Suspense
      fallback={
        <time dateTime={props.dateTime}>{props.children || content}</time>
      }
    >
      <LocaleTime tooltipDelay={250} {...props} />
    </React.Suspense>
  );
}

export default Time;
