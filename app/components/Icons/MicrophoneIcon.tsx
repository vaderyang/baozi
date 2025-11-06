import * as React from "react";

type Props = {
  size?: number;
  fill?: string;
  className?: string;
};

const MicrophoneIcon: React.FC<Props> = ({
  size = 24,
  fill = "currentColor",
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z"
      fill={fill}
    />
    <path
      d="M19 10V12C19 15.87 15.87 19 12 19C8.13 19 5 15.87 5 12V10H3V12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12V10H19Z"
      fill={fill}
    />
    <path d="M11 21H13V24H11V21Z" fill={fill} />
  </svg>
);

export default MicrophoneIcon;
