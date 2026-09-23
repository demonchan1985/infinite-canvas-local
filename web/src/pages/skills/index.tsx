import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentSkillsView } from "@/components/agent/agent-skills-view";

const clientIdStorageKey = "canvas-agent-client-id";

export default function SkillsPage() {
    const { t } = useTranslation();
    const [clientId, setClientId] = useState("");

    useEffect(() => {
        try { setClientId(sessionStorage.getItem(clientIdStorageKey) || ""); } catch { setClientId(""); }
    }, []);

    return (
        <main className="flex h-full flex-col overflow-hidden bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-4 py-6 [background-size:16px_16px] sm:px-6 lg:py-8 dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
            <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
                <div className="mb-5 shrink-0 text-center">
                    <div className="inline-flex items-center gap-2 text-stone-950 dark:text-stone-100"><Sparkles className="size-5" /><h1 className="text-2xl font-semibold">{t("navigation.skills")}</h1></div>
                    <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t("skillsPage.description")}</p>
                </div>
                <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-background/90 shadow-sm backdrop-blur dark:border-stone-800">
                    <AgentSkillsView clientId={clientId} presentation="library" />
                </section>
            </div>
        </main>
    );
}
