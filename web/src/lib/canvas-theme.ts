export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";
export type CanvasBackgroundTone = "neutral" | "blue" | "green" | "violet";

export const canvasBackgroundToneOptions = [
    { value: "neutral", label: "中性" },
    { value: "blue", label: "深蓝" },
    { value: "green", label: "墨绿" },
    { value: "violet", label: "暗紫" },
] as const satisfies ReadonlyArray<{ value: CanvasBackgroundTone; label: string }>;

export const canvasGridStroke = {
    lineWidth: 0.5,
    dotDiameter: (scale: number) => (scale < 0.12 ? 0.45 : 0.7),
};

const canvasBackgroundPalettes = {
    light: {
        neutral: {
            background: "#f7f7f7",
            dot: "rgba(68,64,60,.24)",
            line: "rgba(68,64,60,.10)",
            swatch: "#b8b6b1",
            fill: "#e7e5df",
            panel: "#fbfaf7",
            stroke: "#d6d3ca",
            toolbarPanel: "rgba(255,255,255,.94)",
            toolbarBorder: "#e5e5e5",
            toolbarHover: "#e8f2ff",
        },
        blue: {
            background: "#e1ecfb",
            dot: "rgba(66,105,153,.34)",
            line: "rgba(66,105,153,.14)",
            swatch: "#7f9fca",
            fill: "#d6e5f7",
            panel: "#f2f7ff",
            stroke: "#b7cee8",
            toolbarPanel: "rgba(242,247,255,.94)",
            toolbarBorder: "#c5d9ef",
            toolbarHover: "#dcecff",
        },
        green: {
            background: "#e3f1e7",
            dot: "rgba(58,113,80,.34)",
            line: "rgba(58,113,80,.14)",
            swatch: "#7dae8c",
            fill: "#d4e9db",
            panel: "#f1faf4",
            stroke: "#b8d9c3",
            toolbarPanel: "rgba(241,250,244,.94)",
            toolbarBorder: "#c5e0ce",
            toolbarHover: "#ddf1e4",
        },
        violet: {
            background: "#eee4f7",
            dot: "rgba(103,69,142,.34)",
            line: "rgba(103,69,142,.14)",
            swatch: "#a68ac6",
            fill: "#e4d7f0",
            panel: "#faf5ff",
            stroke: "#d1bfe3",
            toolbarPanel: "rgba(250,245,255,.94)",
            toolbarBorder: "#dccce9",
            toolbarHover: "#eee1f8",
        },
    },
    dark: {
        neutral: {
            background: "#0c0c0c",
            dot: "rgba(245,245,244,.24)",
            line: "rgba(245,245,244,.10)",
            swatch: "#8f8f8d",
            fill: "#1a1a1a",
            panel: "#191919",
            stroke: "#343434",
            toolbarPanel: "rgba(26,26,26,.94)",
            toolbarBorder: "#292929",
            toolbarHover: "#1b3350",
        },
        blue: {
            background: "#0c1c2d",
            dot: "rgba(130,190,255,.34)",
            line: "rgba(130,190,255,.16)",
            swatch: "#71b7ff",
            fill: "#11263a",
            panel: "#102238",
            stroke: "#2b4c6b",
            toolbarPanel: "rgba(16,34,56,.94)",
            toolbarBorder: "#294866",
            toolbarHover: "#173856",
        },
        green: {
            background: "#0b2018",
            dot: "rgba(116,230,170,.34)",
            line: "rgba(116,230,170,.16)",
            swatch: "#68d69c",
            fill: "#11281e",
            panel: "#10251b",
            stroke: "#2c543f",
            toolbarPanel: "rgba(16,37,27,.94)",
            toolbarBorder: "#2a4e3c",
            toolbarHover: "#173a2a",
        },
        violet: {
            background: "#21152d",
            dot: "rgba(207,156,255,.34)",
            line: "rgba(207,156,255,.16)",
            swatch: "#c69cff",
            fill: "#2b1c3b",
            panel: "#281a36",
            stroke: "#563c70",
            toolbarPanel: "rgba(40,26,54,.94)",
            toolbarBorder: "#4d3566",
            toolbarHover: "#38244a",
        },
    },
} as const;

export function canvasBackgroundPalette(theme: CanvasColorTheme, tone: CanvasBackgroundTone) {
    return canvasBackgroundPalettes[theme][tone];
}

export function recentCanvasBackgroundTone(projects: readonly { updatedAt: string; backgroundTone: CanvasBackgroundTone }[]): CanvasBackgroundTone {
    return projects.reduce<(typeof projects)[number] | undefined>((recent, project) => (!recent || project.updatedAt > recent.updatedAt ? project : recent), undefined)?.backgroundTone || "neutral";
}

export function canvasSurfacePalette(theme: CanvasColorTheme, tone: CanvasBackgroundTone) {
    return canvasBackgroundPalettes[theme][tone];
}

export function canvasTitleBackground(theme: CanvasColorTheme, tone: CanvasBackgroundTone) {
    return canvasBackgroundPalette(theme, tone).background;
}

export const canvasThemes = {
    light: {
        canvas: {
            background: "var(--canvas-background)",
            dot: "var(--canvas-grid-dot)",
            line: "var(--canvas-grid-line)",
            selectionStroke: "#1c1917",
            selectionFill: "rgba(28,25,23,.06)",
        },
        node: {
            label: "#57534e",
            fill: "var(--canvas-surface-fill)",
            panel: "var(--canvas-surface-panel)",
            stroke: "var(--canvas-surface-stroke)",
            activeStroke: "#1c1917",
            placeholder: "#8a8479",
            text: "#292524",
            muted: "#78716c",
            faint: "#a8a29e",
        },
        toolbar: {
            panel: "var(--canvas-toolbar-panel)",
            border: "var(--canvas-toolbar-border)",
            item: "#57534e",
            itemHover: "var(--canvas-toolbar-hover)",
            activeBg: "#d7eaff",
            activeText: "#292524",
        },
    },
    dark: {
        canvas: {
            background: "var(--canvas-background)",
            dot: "var(--canvas-grid-dot)",
            line: "var(--canvas-grid-line)",
            selectionStroke: "#fafaf9",
            selectionFill: "rgba(250,250,249,.10)",
        },
        node: {
            label: "#d6d3d1",
            fill: "var(--canvas-surface-fill)",
            panel: "var(--canvas-surface-panel)",
            stroke: "var(--canvas-surface-stroke)",
            activeStroke: "#fafaf9",
            placeholder: "#a8a29e",
            text: "#f5f5f4",
            muted: "#d6d3d1",
            faint: "#78716c",
        },
        toolbar: {
            panel: "var(--canvas-toolbar-panel)",
            border: "var(--canvas-toolbar-border)",
            item: "#d6d3d1",
            itemHover: "var(--canvas-toolbar-hover)",
            activeBg: "#173f6b",
            activeText: "#f5f5f4",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
