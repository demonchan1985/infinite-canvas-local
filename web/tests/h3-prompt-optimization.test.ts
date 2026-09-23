import assert from "node:assert/strict";
import { test } from "node:test";

import { buildH3OptimizationRequest, cleanH3PromptOutput, getH3PromptMode, isValidH3Prompt } from "../src/lib/h3-prompt-optimization.ts";

test("全能参考模式使用 Ref2VA 六段 H3 结构", () => {
    assert.equal(getH3PromptMode({ isReferenceMode: true, hasFirstFrame: false, hasLastFrame: false }), "Ref2VA");
    assert.ok(buildH3OptimizationRequest({ prompt: "女生在背景中跳舞", mode: "Ref2VA", duration: "5", referenceCount: 1, referenceVideoCount: 0, referenceAudioCount: 0 }).includes("subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music"));
    assert.equal(
        isValidH3Prompt("subject_definitions:\n<Subject 1> is the woman in <Picture 1>.\n\nsummary:\n[reference generation] <Subject 1> dances.\n\nretention_analysis:\n<Subject 1>: fully_preserved - appearance remains.\n\ndetailed_description:\n[Shot 1] <Subject 1> dances.\n\noverall_soundscape: Soft wind.\n\nnon_diegetic_music: Light drums.", "Ref2VA"),
        true,
    );
});

test("关键帧模式保留首尾帧对齐指令并移除代码围栏", () => {
    assert.equal(getH3PromptMode({ isReferenceMode: false, hasFirstFrame: true, hasLastFrame: true }), "FL2VA");
    const request = buildH3OptimizationRequest({ prompt: "女生转身", mode: "FL2VA", duration: "5", referenceCount: 2, referenceVideoCount: 0, referenceAudioCount: 0 });
    assert.match(request, /Picture 2 \(from Shot 1\) aligns with the 5\.00-second mark/);
    assert.equal(cleanH3PromptOutput("```text\nintegrated_multimodal_description: [Shot 1] A woman turns.\n\noverall_soundscape: Footsteps.\n\nnon_diegetic_music: N/A\n```"), "integrated_multimodal_description: [Shot 1] A woman turns.\n\noverall_soundscape: Footsteps.\n\nnon_diegetic_music: N/A");
});
