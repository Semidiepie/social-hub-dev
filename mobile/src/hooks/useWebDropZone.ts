// useWebDropZone — cross-platform drag-and-drop for file uploads.
//
// On web this attaches native DOM listeners to <body> so files dropped
// anywhere over the app fire our callback. It also tracks an "isOver"
// state so the caller can render a highlight/overlay.
//
// On native this is a no-op (returns { isOver: false }).
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

interface Options {
  /** Called with the first file dropped. Optional MIME filter via `accept`. */
  onFile: (file: File) => void;
  /** Filter prefix like "image/" or "video/" — pass undefined to accept all. */
  accept?: string;
  /** Disable when the composer is busy. */
  disabled?: boolean;
}

export function useWebDropZone(opts: Options) {
  const [isOver, setIsOver] = useState(false);
  // Use a counter to avoid dragenter/dragleave flicker when hovering children.
  const depth = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    // In SSR/prerender there is no document.
    if (typeof document === "undefined") return;

    const onDragEnter = (e: DragEvent) => {
      if (optsRef.current.disabled) return;
      e.preventDefault();
      depth.current += 1;
      if (depth.current === 1) setIsOver(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (optsRef.current.disabled) return;
      // Necessary to let onDrop fire.
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (optsRef.current.disabled) return;
      e.preventDefault();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setIsOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (optsRef.current.disabled) return;
      e.preventDefault();
      depth.current = 0;
      setIsOver(false);
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const accept = optsRef.current.accept;
      const match = accept
        ? Array.from(files).find((f) => f.type.startsWith(accept))
        : files[0];
      if (match) optsRef.current.onFile(match);
    };

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  return { isOver };
}
