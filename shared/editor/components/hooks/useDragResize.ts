import * as React from "react";

type DragDirection = "left" | "right";

type SizeState = { width: number; height?: number };

/**
 * Hook for resizing an element by dragging its sides.
 */
type ReturnValue = {
  /** Event handler for pointer down event on the resize handle. */
  handlePointerDown: (
    dragging: DragDirection
  ) => (event: React.PointerEvent<HTMLDivElement>) => void;
  /** Handler to set the new size of the element from outside. */
  setSize: React.Dispatch<React.SetStateAction<SizeState>>;
  /** Whether the element is currently being resized. */
  dragging: boolean;
  /** The current width of the element. */
  width: number;
  /** The current height of the element. */
  height?: number;
};

type Params = {
  /** Callback triggered when the image is resized */
  onChangeSize?: undefined | ((size: SizeState) => void);
  /** The initial width of the element. */
  width: number;
  /** The initial height of the element. */
  height: number;
  /** The natural width of the element. */
  naturalWidth: number;
  /** The natural height of the element. */
  naturalHeight: number;
  /** The percentage of the grid to snap the element to. */
  gridSnap: 5;
  /** A reference to the element being resized. */
  ref: React.RefObject<HTMLDivElement>;
};

export default function useDragResize(props: Params): ReturnValue {
  const [size, setSize] = React.useState<SizeState>({
    width: props.width,
    height: props.height,
  });
  const [maxWidth, setMaxWidth] = React.useState(Infinity);
  const [offset, setOffset] = React.useState(0);
  const [sizeAtDragStart, setSizeAtDragStart] = React.useState(size);
  const [dragging, setDragging] = React.useState<DragDirection>();
  const isResizable = !!props.onChangeSize;

  const constrainWidth = (width: number, max: number) => {
    const minWidth = Math.min(props.naturalWidth, (props.gridSnap / 100) * max);
    return Math.round(Math.min(max, Math.max(width, minWidth)));
  };

  const handlePointerMove = (event: PointerEvent) => {
    event.preventDefault();

    let diff;
    if (dragging === "left") {
      diff = offset - event.pageX;
    } else {
      diff = event.pageX - offset;
    }

    const gridWidth = (props.gridSnap / 100) * maxWidth;
    const newWidth = sizeAtDragStart.width + diff * 2;
    const widthOnGrid = Math.round(newWidth / gridWidth) * gridWidth;
    const constrainedWidth = constrainWidth(widthOnGrid, maxWidth);
    const aspectRatio = props.naturalHeight / props.naturalWidth;

    setSize({
      width: constrainedWidth,
      height: props.naturalWidth
        ? Math.round(constrainedWidth * aspectRatio)
        : undefined,
    });
  };

  const handlePointerUp = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();

    setOffset(0);
    setDragging(undefined);
    props.onChangeSize?.(size);

    document.removeEventListener("mousemove", handlePointerMove);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();

      setSize(sizeAtDragStart);
      setDragging(undefined);
    }
  };

  const handlePointerDown =
    (dragDirection: "left" | "right") =>
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      // Calculate constraints once at the start of dragging as it's relatively expensive operation
      const max = props.ref.current
        ? parseInt(
            getComputedStyle(props.ref.current).getPropertyValue(
              "--document-width"
            )
          )
        : Infinity;
      setMaxWidth(max);
      setSizeAtDragStart({
        width: constrainWidth(size.width, max),
        height: size.height,
      });
      setOffset(event.pageX);
      setDragging(dragDirection);
    };

  React.useEffect(() => {
    if (!isResizable) {
      return;
    }

    if (dragging) {
      document.body.style.cursor = "ew-resize";
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    }

    return () => {
      document.body.style.cursor = "initial";
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragging, handlePointerMove, handlePointerUp, isResizable]);

  return {
    handlePointerDown,
    dragging: !!dragging,
    setSize,
    width: size.width,
    height: size.height,
  };
}
