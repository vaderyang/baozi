import * as React from "react";
import styled from "styled-components";
import { s } from "../../styles";

const PlayIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
  </svg>
);

type Props = {
  /** URL of the audio file to play */
  src: string;
  /** Whether the player is in editable mode */
  isEditable?: boolean;
  /** Children to render (typically the FileExtension icon) */
  children: React.ReactNode;
};

export default function AudioPlayer({ src, isEditable, children }: Props) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  const togglePlayPause = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!audioRef.current) {return;}

      if (isPlaying) {
        audioRef.current.pause();
      } else {
        void audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    },
    [isPlaying]
  );

  const handleTimeUpdate = React.useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = React.useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  const handleEnded = React.useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />
      <IconContainer>
        {children}
        <PlayButtonOverlay
          onClick={togglePlayPause}
          aria-label={isPlaying ? "Pause" : "Play"}
          $isEditable={isEditable}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </PlayButtonOverlay>
      </IconContainer>
      <ProgressOverlay progress={progress} />
    </>
  );
}

const IconContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const PlayButtonOverlay = styled.button<{ $isEditable?: boolean }>`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  color: white;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s ease;
  z-index: 1;

  ${IconContainer}:hover & {
    opacity: 1;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.5);
    transform: translate(-50%, -50%) scale(1.1);
  }

  &:active {
    transform: translate(-50%, -50%) scale(0.95);
  }
`;

export const ProgressOverlay = styled.div<{ progress: number }>`
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: ${(props) => props.progress}%;
  background: ${s("primary")};
  opacity: 0.15;
  pointer-events: none;
  transition: width 0.1s linear;
  border-radius: 8px;
`;
