// Message-list windowing: render only the most recent N bubbles to cap DOM nodes on long
// histories (the history page can be up to 200). "Show earlier messages" reveals another step.
// This is dependency-free virtualization tuned for chat UX (you almost always view the tail).
export const MESSAGE_WINDOW_INITIAL = 60;
export const MESSAGE_WINDOW_STEP = 60;
