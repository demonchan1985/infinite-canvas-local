import { ArrowRight, Clapperboard, Palette, Sparkles } from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";

import { navigationTools } from "@/constant/navigation-tools";

function Highlighter({ action, color, children }: { action: "highlight" | "underline"; color: string; children?: ReactNode }) {
    return (
        <span className="relative inline-block px-1">
            {action === "highlight" ? (
                <span className="absolute inset-x-0 bottom-0 top-1 rounded-sm opacity-45" style={{ backgroundColor: color }} />
            ) : (
                <span className="absolute inset-x-0 bottom-0 h-1 rounded-full opacity-80" style={{ backgroundColor: color }} />
            )}
            <span className="relative font-medium text-stone-800 dark:text-stone-200">{children}</span>
        </span>
    );
}

export default function IndexPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [primaryTool] = navigationTools;
    const nodeNativeTools = [
        { icon: Palette, title: t("home.nodeNativeTools.image.title"), description: t("home.nodeNativeTools.image.description"), tools: t("home.nodeNativeTools.image.tools") },
        { icon: Clapperboard, title: t("home.nodeNativeTools.video.title"), description: t("home.nodeNativeTools.video.description"), tools: t("home.nodeNativeTools.video.tools") },
        { icon: Sparkles, title: t("home.nodeNativeTools.canvas.title"), description: t("home.nodeNativeTools.canvas.description"), tools: t("home.nodeNativeTools.canvas.tools") },
    ];

    return (
        <main className="min-h-full overflow-y-auto bg-background text-stone-950 dark:text-stone-100">
            <section className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-6">
                <div className="flex min-h-[620px] flex-col items-center justify-center py-20 text-center">
                    <h1 className="ai-title-aurora max-w-5xl text-balance text-5xl font-semibold tracking-normal sm:text-7xl lg:text-8xl">{t("meta.title")}</h1>
                    <p className="mt-8 max-w-3xl text-balance text-lg leading-8 text-stone-500 dark:text-stone-400">
                        <Trans i18nKey="home.description" components={{ canvas: <Highlighter action="underline" color="#FF9800" />, content: <Highlighter action="highlight" color="#87CEFA" /> }} />
                    </p>
                    <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                        <Button type="primary" size="large" onClick={() => navigate(`/${primaryTool.slug}`)} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            {t("home.start")}
                        </Button>
                        <Button size="large" onClick={() => navigate("/canvas")}>
                            {t("home.openCanvas")}
                        </Button>
                    </div>
                </div>

                <section className="mx-auto max-w-6xl border-t border-stone-200 py-16 dark:border-stone-800">
                    <div className="mx-auto max-w-2xl text-center">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">{t("home.nodeNativeTools.eyebrow")}</div>
                        <h2 className="mt-3 text-3xl font-semibold text-stone-950 dark:text-stone-100">{t("home.nodeNativeTools.title")}</h2>
                        <p className="mt-3 text-base leading-7 text-stone-500 dark:text-stone-400">{t("home.nodeNativeTools.description")}</p>
                    </div>
                    <div className="mt-10 grid gap-4 md:grid-cols-3">
                        {nodeNativeTools.map((item) => {
                            const Icon = item.icon;
                            return (
                                <article key={item.title} className="rounded-2xl border border-stone-200 bg-card p-6 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 dark:border-stone-800">
                                    <span className="grid size-10 place-items-center rounded-xl bg-stone-100 dark:bg-stone-800"><Icon className="size-5" /></span>
                                    <h3 className="mt-6 text-lg font-semibold">{item.title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{item.description}</p>
                                    <p className="mt-5 text-xs font-medium tracking-wide text-stone-600 dark:text-stone-300">{item.tools}</p>
                                </article>
                            );
                        })}
                    </div>
                </section>
            </section>
        </main>
    );
}
