import { create } from "zustand";

type CanvasWorkspaceStore = {
    viewMode: CanvasViewMode;
    focusMode: boolean;
    searchOpen: boolean;
    setViewMode: (viewMode: CanvasViewMode) => void;
    setFocusMode: (focusMode: boolean) => void;
    setSearchOpen: (searchOpen: boolean) => void;
};

export type CanvasViewMode = "simple" | "professional";

function getInitialViewMode(): CanvasViewMode {
    if (typeof window === "undefined") return "professional";
    return window.localStorage.getItem("canvas-workspace-mode-v1") === "simple" ? "simple" : "professional";
}

export const useCanvasWorkspaceStore = create<CanvasWorkspaceStore>((set) => ({
    viewMode: getInitialViewMode(),
    focusMode: false,
    searchOpen: false,
    setViewMode: (viewMode) => {
        if (typeof window !== "undefined") window.localStorage.setItem("canvas-workspace-mode-v1", viewMode);
        set({ viewMode });
    },
    setFocusMode: (focusMode) => set({ focusMode }),
    setSearchOpen: (searchOpen) => set({ searchOpen }),
}));
