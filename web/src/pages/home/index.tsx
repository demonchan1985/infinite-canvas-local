import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { canvasBackgroundPalette, canvasThemes, recentCanvasBackgroundTone } from "@/lib/canvas-theme";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useThemeStore } from "@/stores/use-theme-store";

import "./home.css";

const sceneImages = ["style-538.webp", "style-580.webp", "style-611.webp"];

export default function IndexPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const theme = useThemeStore((state) => state.theme);
    const projects = useCanvasStore((state) => state.projects);
    const tone = recentCanvasBackgroundTone(projects);
    const palette = canvasBackgroundPalette(theme, tone);
    const themeColors = canvasThemes[theme];
    const [sceneIndex, setSceneIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [visible, setVisible] = useState(() => document.visibilityState === "visible");
    const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const scenes = [0, 1, 2].map((index) => ({
        index,
        image: `/creative-presets/${sceneImages[index]}`,
        name: t(`home.stage.scenes.${index}.name`),
        title: t(`home.stage.scenes.${index}.title`),
        descriptionTitle: t(`home.stage.scenes.${index}.descriptionTitle`),
        description: t(`home.stage.scenes.${index}.description`),
        imageTitle: t(`home.stage.scenes.${index}.imageTitle`),
        videoTitle: t(`home.stage.scenes.${index}.videoTitle`),
        detail: t(`home.stage.scenes.${index}.detail`),
        imageAlt: t(`home.stage.scenes.${index}.imageAlt`),
    }));
    const activeScene = scenes[sceneIndex];

    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onMotionChange = () => setReducedMotion(media.matches);
        const onVisibilityChange = () => setVisible(document.visibilityState === "visible");
        media.addEventListener("change", onMotionChange);
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            media.removeEventListener("change", onMotionChange);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, []);

    useEffect(() => {
        if (paused || hovered || focused || reducedMotion || !visible) return;
        const timer = window.setTimeout(() => setSceneIndex((index) => (index + 1) % sceneImages.length), 6500);
        return () => window.clearTimeout(timer);
    }, [focused, hovered, paused, reducedMotion, sceneIndex, visible]);

    const colors = {
        "--home-bg": palette.background,
        "--home-line": palette.line,
        "--home-swatch": palette.swatch,
        "--home-fill": palette.fill,
        "--home-panel": palette.panel,
        "--home-stroke": palette.stroke,
        "--home-text": themeColors.node.text,
        "--home-subtext": themeColors.node.label,
        "--home-quiet": theme === "dark" ? `color-mix(in srgb, ${themeColors.node.muted} 55%, ${themeColors.node.faint})` : themeColors.node.label,
        "--home-highlight": tone === "neutral" ? themeColors.node.label : theme === "dark" ? palette.swatch : `color-mix(in srgb, ${palette.swatch} 60%, ${themeColors.node.text})`,
        "--home-shadow": theme === "dark" ? "0 28px 80px rgba(0,0,0,.3)" : "0 28px 80px rgba(33,43,40,.11)",
    } as CSSProperties;

    return (
        <main className="home-page" style={colors}>
            <section className="home-hero">
                <div className="home-copy">
                    <span className="home-eyebrow">{t("home.hero.eyebrow")}</span>
                    <h1>
                        {t("home.hero.line1")}
                        <br />
                        <em>{t("home.hero.line2")}</em>
                    </h1>
                    <p>{t("home.hero.description")}</p>
                    <div className="home-actions">
                        <button className="home-primary" type="button" onClick={() => navigate("/canvas?mode=new")}>
                            {t("home.hero.start")} <ArrowRight size={16} aria-hidden="true" />
                        </button>
                        <button className="home-secondary" type="button" onClick={() => navigate("/canvas")}>
                            {t("home.hero.myCanvas")}
                        </button>
                    </div>
                    <span className="home-note">{t("home.hero.note")}</span>
                </div>

                <section
                    className="home-workspace"
                    role="region"
                    aria-roledescription={t("home.stage.carousel")}
                    aria-label={t("home.stage.label")}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    onFocus={() => setFocused(true)}
                    onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.preventDefault();
                        setSceneIndex((index) => (index + (event.key === "ArrowRight" ? 1 : sceneImages.length - 1)) % sceneImages.length);
                    }}
                >
                    <div className="home-workspace-top">
                        <span>{activeScene.title}</span>
                        <span>{t("home.stage.count", { current: sceneIndex + 1, total: scenes.length })}</span>
                    </div>
                    <div className="home-board">
                        {scenes.map((item) => (
                            <div
                                key={item.index}
                                className="home-slide"
                                role="group"
                                aria-roledescription={t("home.stage.scene")}
                                aria-label={t("home.stage.sceneLabel", { current: item.index + 1, total: scenes.length, name: item.name })}
                                aria-hidden={item.index !== sceneIndex}
                            >
                                <svg className="home-wire" viewBox="0 0 700 468" preserveAspectRatio="none" aria-hidden="true">
                                    <path d="M 287 168 C 365 168, 330 140, 416 140" />
                                    <path d="M 570 288 C 638 310, 552 350, 548 365" />
                                </svg>
                                <div className="home-card home-text-card">
                                    <div className="home-card-head">
                                        <span>{item.descriptionTitle}</span>
                                        <span>{t("home.stage.text")}</span>
                                    </div>
                                    <p>{item.description}</p>
                                </div>
                                <div className="home-card home-image-card">
                                    <div className="home-card-head">
                                        <span>{item.imageTitle}</span>
                                        <span>{t("home.stage.image")}</span>
                                    </div>
                                    <div className="home-card-media">
                                        <img src={item.image} alt={item.imageAlt} loading={item.index === 0 ? "eager" : "lazy"} />
                                    </div>
                                </div>
                                <div className="home-card home-video-card">
                                    <div className="home-card-head">
                                        <span>{item.videoTitle}</span>
                                        <span>{t("home.stage.video")}</span>
                                    </div>
                                    <div className="home-card-media">
                                        <img src={item.image} alt="" loading="lazy" />
                                        <span className="home-play-mark" aria-hidden="true">
                                            <Play size={16} fill="currentColor" />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="home-workspace-bottom">
                        <div className="home-scene-caption">
                            <strong>{activeScene.name}</strong>
                            <span>{activeScene.detail}</span>
                        </div>
                        <div className="home-carousel-controls" role="group" aria-label={t("home.stage.controls")}>
                            <button type="button" aria-label={t("home.stage.previous")} onClick={() => setSceneIndex((index) => (index + scenes.length - 1) % scenes.length)}>
                                <ArrowLeft size={17} />
                            </button>
                            <div className="home-dots" role="group" aria-label={t("home.stage.select")}>
                                {scenes.map((item) => (
                                    <button
                                        key={item.index}
                                        className="home-dot"
                                        type="button"
                                        aria-label={t("home.stage.goTo", { current: item.index + 1, name: item.name })}
                                        aria-current={item.index === sceneIndex}
                                        onClick={() => setSceneIndex(item.index)}
                                    />
                                ))}
                            </div>
                            <button type="button" aria-label={t("home.stage.next")} onClick={() => setSceneIndex((index) => (index + 1) % scenes.length)}>
                                <ArrowRight size={17} />
                            </button>
                            {!reducedMotion ? (
                                <button className="home-pause" type="button" aria-label={t(paused ? "home.stage.resume" : "home.stage.pause")} onClick={() => setPaused((value) => !value)}>
                                    {t(paused ? "home.stage.resume" : "home.stage.pause")}
                                </button>
                            ) : null}
                        </div>
                    </div>
                </section>
            </section>

            <section className="home-lower-strip" aria-label={t("home.steps.label")}>
                {[0, 1, 2].map((index) => (
                    <div key={index}>
                        <span>{t(`home.steps.items.${index}.eyebrow`)}</span>
                        <strong>{t(`home.steps.items.${index}.title`)}</strong>
                        <p>{t(`home.steps.items.${index}.description`)}</p>
                    </div>
                ))}
            </section>
        </main>
    );
}
