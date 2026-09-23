export type H3PromptMode = "T2VA" | "I2VA" | "FL2VA" | "L2VA" | "Ref2VA";

export function getH3PromptMode({ isReferenceMode, hasFirstFrame, hasLastFrame }: { isReferenceMode: boolean; hasFirstFrame: boolean; hasLastFrame: boolean }): H3PromptMode {
    if (isReferenceMode) return "Ref2VA";
    if (hasFirstFrame && hasLastFrame) return "FL2VA";
    if (hasFirstFrame) return "I2VA";
    if (hasLastFrame) return "L2VA";
    return "T2VA";
}

export function buildH3OptimizationRequest({ prompt, mode, duration, referenceCount, referenceVideoCount, referenceAudioCount }: { prompt: string; mode: H3PromptMode; duration: string; referenceCount: number; referenceVideoCount: number; referenceAudioCount: number }) {
    const alignment = mode === "I2VA"
        ? "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced."
        : mode === "FL2VA"
            ? `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${Number(duration).toFixed(2)}-second mark of the target video.`
            : mode === "L2VA"
                ? `How the reference pictures align with the target video — <Picture 1> (from [Shot 1]) aligns with the ${Number(duration).toFixed(2)}-second mark of the target video.`
                : "";
    const sections = mode === "Ref2VA"
        ? "subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music"
        : "integrated_multimodal_description, overall_soundscape, non_diegetic_music";
    return [
        "You are a MiniMax H3 prompt-writing agent. Rewrite the user's request according to the H3 prompt-writing specification, not as a generic prose polish.",
        `Mode: ${mode}. Target duration: ${duration} seconds. Available reference images: ${referenceCount}; reference videos: ${referenceVideoCount}; reference audios: ${referenceAudioCount}.`,
        `Use these sections in this exact order: ${sections}. ${alignment ? `The first line must be exactly this alignment instruction: ${alignment}` : mode === "T2VA" ? "T2VA has no alignment instruction and starts directly with the three core fields." : ""}`,
        "Write rewrite sections in English. Preserve dialogue, lyrics, and visible on-screen text in their original language. Keep reference labels stable, describe composition, subjects, environment, actions, camera, sound, and exact timing, and make the timeline match the target duration.",
        "Return only the final H3 prompt, with no explanation, Markdown fence, or prefatory text.",
        `User request:\n${prompt}`,
    ].join("\n\n");
}

export function cleanH3PromptOutput(value: string) {
    return value.trim().replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function isValidH3Prompt(value: string, mode: H3PromptMode) {
    if (!value) return false;
    const core = ["integrated_multimodal_description:", "overall_soundscape:", "non_diegetic_music:"];
    if (mode === "Ref2VA") return ["subject_definitions:", "summary:", "retention_analysis:", "detailed_description:", "overall_soundscape:", "non_diegetic_music:"].every((field) => value.includes(field));
    if (!core.every((field) => value.includes(field))) return false;
    if (mode === "I2VA") return value.startsWith("For the target video, at 0.00 seconds into the target video,");
    if (mode === "FL2VA" || mode === "L2VA") return value.startsWith("How the reference pictures align with the target video");
    return true;
}
