
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import {
  Loader2,
  ArrowLeft,
  Search,
  TowerControl,
  Users as UsersIcon,
  Gavel,
  Store,
  Sparkles,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SocietyPyramid from "./components/SocietyPyramid";
import SocietyClans from "./components/SocietyClans";
import SocietyPrison from "./components/SocietyPrison";
import SocietyStore from "./components/SocietyStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function SocietyClient() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"pyramid" | "clans" | "prison" | "store">("pyramid");
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Persist selected tab locally (no server calls)
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("societyTab") : null;
    if (saved === "pyramid" || saved === "clans" || saved === "prison" || saved === "store") {
      setActiveTab(saved);
    }
  }, []);

  const handleTabChange = useCallback((value: string) => {
    const v = value as typeof activeTab;
    setActiveTab(v);
    if (typeof window !== "undefined") localStorage.setItem("societyTab", v);
  }, [setActiveTab]);

  // Keyboard shortcut to focus search with /
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gray-950">
        <Loader2 className="h-10 w-10 animate-spin text-purple-300" />
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-gray-950 text-white font-sans">
      {/* Atmospheric layers (already used elsewhere in the app) */}
      <div className="fixed inset-0 stars z-0" />
      <div className="fixed inset-0 twinkling z-0" />
      {/* Soft aurora glow */}
      <div className="pointer-events-none fixed -top-24 right-0 left-0 z-0 h-64 blur-3xl" aria-hidden>
        <div className="mx-auto h-full max-w-5xl bg-gradient-to-r from-fuchsia-600/20 via-purple-500/20 to-indigo-500/20" />
      </div>

      <main className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-wide">
                <span className="bg-gradient-to-r from-purple-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent drop-shadow">مجتمع اللعبة</span>
              </h1>
              <p className="mt-2 text-base md:text-lg text-gray-300/90 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-300" />
                حيث تتجلى القوة والنفوذ — اصنع سمعتك، كوّن تحالفاتك، واترك أثرك.
              </p>
            </div>

            <div className="flex items-center gap-3 md:gap-4">
              {/* Search */}
              <div className="relative w-72 md:w-80">
                <Input
                  ref={searchRef}
                  placeholder="ابحث عن لاعب ( / )"
                  className="bg-gray-900/70 border-purple-500/40 text-white placeholder:text-gray-400 focus:ring-purple-500 pl-10 pr-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="ابحث عن لاعب"
                />
                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                {searchTerm && (
                  <button
                    type="button"
                    aria-label="مسح البحث"
                    onClick={() => setSearchTerm("")}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs text-gray-300 hover:text-white"
                  >
                    مسح
                  </button>
                )}
              </div>

              <button
                onClick={() => router.push("/")}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                aria-label="العودة للصفحة الرئيسية"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
            </div>
          </div>
        </motion.header>

        {/* Fancy segmented Tabs */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div
              className={cn(
                "rounded-2xl p-[1px]",
                "bg-gradient-to-r from-purple-700/50 via-fuchsia-600/40 to-amber-500/40"
              )}
            >
              <div className="rounded-2xl bg-black/30 backdrop-blur-md border border-purple-500/30">
                <TabsList className="grid w-full grid-cols-4 rounded-2xl bg-transparent p-1">
                  <TabsTrigger
                    value="pyramid"
                    className={
                      "group relative rounded-xl data-[state=active]:bg-purple-600/20 data-[state=active]:shadow-inner data-[state=active]:text-white text-purple-200 hover:bg-white/5 transition-colors"
                    }
                  >
                    <TowerControl className="mr-2 h-4 w-4" /> الهرم الاجتماعي
                  </TabsTrigger>
                  <TabsTrigger
                    value="clans"
                    className={
                      "group relative rounded-xl data-[state=active]:bg-purple-600/20 data-[state=active]:shadow-inner data-[state=active]:text-white text-purple-200 hover:bg-white/5 transition-colors"
                    }
                  >
                    <UsersIcon className="mr-2 h-4 w-4" /> الفرق
                  </TabsTrigger>
                  <TabsTrigger
                    value="prison"
                    className={
                      "group relative rounded-xl data-[state=active]:bg-purple-600/20 data-[state=active]:shadow-inner data-[state=active]:text-white text-purple-200 hover:bg-white/5 transition-colors"
                    }
                  >
                    <Gavel className="mr-2 h-4 w-4" /> غرفة العقاب
                  </TabsTrigger>
                  <TabsTrigger
                    value="store"
                    className={
                      "group relative rounded-xl data-[state=active]:bg-purple-600/20 data-[state=active]:shadow-inner data-[state=active]:text-white text-purple-200 hover:bg-white/5 transition-colors"
                    }
                  >
                    <Store className="mr-2 h-4 w-4" /> المتجر
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            {/* Content area with smooth entrance */}
            <div className="mt-6">
              <TabsContent value="pyramid" className="m-0">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <SocietyPyramid searchTerm={searchTerm} />
                </motion.div>
              </TabsContent>

              <TabsContent value="clans" className="m-0">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <SocietyClans />
                </motion.div>
              </TabsContent>

              <TabsContent value="prison" className="m-0">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <SocietyPrison />
                </motion.div>
              </TabsContent>

              <TabsContent value="store" className="m-0">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <SocietyStore />
                </motion.div>
              </TabsContent>
            </div>
          </Tabs>
        </motion.div>
      </main>
    </div>
  );
}
