import assert from "node:assert/strict";
import test from "node:test";

import { getAntThemeConfig } from "../src/lib/app-theme.ts";
import { canvasSurfacePalette } from "../src/lib/canvas-theme.ts";

test("设置弹窗和渠道抽屉使用同一画布表面底色", () => {
    for (const mode of ["light", "dark"] as const) {
        const surface = canvasSurfacePalette(mode, "neutral");
        const theme = getAntThemeConfig(mode === "dark");
        assert.equal(theme.token?.colorBgElevated, surface.panel);
        assert.equal(theme.components?.Dropdown?.colorBgElevated, surface.panel);
    }
});
