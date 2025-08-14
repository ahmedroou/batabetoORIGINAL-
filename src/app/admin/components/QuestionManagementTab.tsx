"use client";

/**
 * QuestionManagementTab.gpt5.tsx
 * -------------------------------------------------------------
 * واجهة إدارة محتوى الألعاب (رفع/حذف/إدارة الأقسام) بإصدار مُحسّن.
 * 
 * ✨ التحسينات الرئيسية:
 * - تصميم حديث باستخدام shadcn/ui + Tailwind مع لمسات جمالية.
 * - دعم السحب والإفلات لملفات JSON + التحقق بـ Zod مع رسائل أخطاء واضحة.
 * - عدّ مُسبق قبل الحذف (countQuestions) لمعرفة الأثر قبل التأكيد.
 * - إدارة أقسام محسّنة (بحث داخل الأقسام، تعديل فوري، حماية من التكرار، حوارات تأكيد).
 * - مؤشرات حالة/تحميل، وتعامل أنيق مع الأخطاء عبر toast.
 * - حركات لطيفة باستخدام framer-motion.
 * - الاعتماد على دوال الباك-إند الموحّدة (التي أنشأناها في ملف admin-actions.gpt5-refactor.ts).
 * 
 * 
 * ملاحظات:
 * - مكتوب بـ GPT-5 Thinking – تم الانتباه للأداء، القابلية للتوسع، و DX.
 * - جميع النصوص عربية، والاتجاه RTL افتراضي للمكوّن.
 * -------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { clsx } from "clsx";

import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import {
  uploadTrapAnswerQuestionsFromJson,
  addTrapAnswerCategory,
  deleteTrapAnswerCategory,
  editTrapAnswerCategory,
  getTrapAnswerCategories,
  getEducatedMerchantCategories,
  addEducatedMerchantCategory,
  editEducatedMerchantCategory,
  deleteEducatedMerchantCategory,
  deleteQuestions,
  countQuestions,
  uploadWordWarWordsFromJson,
  deleteDuplicateWords,
  uploadPrisonQuestionsFromJson,
  deleteSimilarQuestions,
  deleteSimilarPrisonQuestions,
  uploadEducatedMerchantQuestionsFromJson,
} from "@/lib/actions/admin";

import type { Game } from "@/types";
import { Info, Upload, Trash2, Sparkles, Edit, Save, Loader2, FileUp, FileX2, X, RefreshCw, Filter, Download, Check } from "lucide-react";

/* -------------------------------------------------------------
 * أنواع/مخططات التحقق Zod
 * ----------------------------------------------------------- */
const TrapOrMerchantSchema = z.object({
  question: z.string().min(1, "نص السؤال مطلوب"),
  answer: z.string().min(1, "نص الجواب مطلوب"),
  dummyAnswers: z.array(z.string().min(1)).optional(),
});

const PrisonSchema = z.object({
  text: z.string().min(1, "النص مطلوب"),
});

const TrapMerchantArraySchema = z.array(TrapOrMerchantSchema);
const PrisonArraySchema = z.array(PrisonSchema);
const WordWarArraySchema = z.array(z.string().min(1));

// يَقبل أيضاً ملفات على هيئة: { questions: [...] } أو { words: [...] }
const asQuestionsArray = (json: any): any[] | null => {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.questions)) return json.questions;
  return null;
};
const asWordsArray = (json: any): string[] | null => {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.words)) return json.words;
  return null;
};

/* -------------------------------------------------------------
 * مساعدات
 * ----------------------------------------------------------- */
const normalize = (s: string) => (s ?? "").trim().replace(/\s+/g, " ");
const signature = (s: string) => normalize(s).toLowerCase();

function dedupeLocal<T>(arr: T[], keyer: (t: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = keyer(item);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/* -------------------------------------------------------------
 * أنواع داخلية
 * ----------------------------------------------------------- */

type GameKey = "trap-answer" | "educated-merchant" | "word_war" | "prison" | "";

type DeletionParams = {
  game: Exclude<GameKey, "">;
  category?: string;
  all?: boolean;
  duplicates?: boolean;
  searchTerm?: string;
  answerSearchTerm?: string;
};

/* -------------------------------------------------------------
 * مُكوّن إدارة الأقسام (مع تحسينات)
 * ----------------------------------------------------------- */
const CategoryManager: React.FC<{
  gameType: "trap-answer" | "educated-merchant";
  categories: string[];
  setCategories: React.Dispatch<React.SetStateAction<string[]>>;
  onAdd: (name: string) => Promise<any>;
  onEdit: (oldName: string, newName: string) => Promise<any>;
  onDelete: (name: string) => Promise<any>;
}> = ({ gameType, categories, setCategories, onAdd, onEdit, onDelete }) => {
  const { toast } = useToast();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<{ oldName: string; newName: string } | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return categories;
    return categories.filter((c) => c.toLowerCase().includes(f));
  }, [categories, filter]);

  const handleAddCategory = async () => {
    const value = normalize(newCategoryName);
    if (!value) {
      toast({ title: "اسم القسم مطلوب", variant: "destructive" });
      return;
    }
    if (categories.includes(value)) {
      toast({ title: "موجود مسبقًا", description: "هذا القسم متوفر بالفعل.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    const result = await onAdd(value);
    setIsSubmitting(false);

    if (result?.success) {
      toast({ title: "تمت إضافة القسم بنجاح" });
      setCategories((prev) => [...prev, value]);
      setNewCategoryName("");
    } else {
      toast({ title: "خطأ", description: result?.error ?? "تعذر إضافة القسم.", variant: "destructive" });
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory) return;
    const value = normalize(editingCategory.newName);
    if (!value) return;
    if (value === editingCategory.oldName) {
      setEditingCategory(null);
      return;
    }
    if (categories.includes(value)) {
      toast({ title: "اسم مستخدم", description: "هناك قسم بنفس الاسم.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    const result = await onEdit(editingCategory.oldName, value);
    setIsSubmitting(false);

    if (result?.success) {
      toast({ title: "تم تعديل الاسم" });
      setCategories((prev) => prev.map((c) => (c === editingCategory.oldName ? value : c)));
      setEditingCategory(null);
    } else {
      toast({ title: "خطأ", description: result?.error ?? "تعذر تعديل القسم.", variant: "destructive" });
    }
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategory) return;
    setIsSubmitting(true);
    const result = await onDelete(deletingCategory);
    setIsSubmitting(false);

    if (result?.success) {
      toast({ title: "تم حذف القسم", description: `تم حذف ${result.count || 0} عنصر مرتبط.` });
      setCategories((prev) => prev.filter((c) => c !== deletingCategory));
      setDeletingCategory(null);
    } else {
      toast({ title: "خطأ", description: result?.error ?? "تعذر حذف القسم.", variant: "destructive" });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <Card>
        <CardHeader>
          <CardTitle>إدارة أقسام {gameType === "trap-answer" ? "الجواب المفخخ" : "التاجر المتعلم"}</CardTitle>
          <CardDescription>إضافة، تعديل، وحذف الأقسام. تسهيلات بحث ومنع تكرار.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2 space-y-2">
              <Label>إضافة قسم جديد</Label>
              <div className="flex gap-2">
                <Input placeholder="اسم القسم الجديد" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
                <Button onClick={handleAddCategory} disabled={isSubmitting}>
                  {isSubmitting ? "..." : "إضافة"}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>بحث</Label>
              <div className="flex gap-2 items-center">
                <Input placeholder="ابحث داخل الأقسام" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Info className="w-5 h-5 opacity-70" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>اكتب أي جزء من الاسم للتصفية الفورية.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>الأقسام الحالية</Label>
            <ScrollArea className="h-64 border rounded-md p-2">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">لا توجد أقسام مطابقة.</p>
              )}
              {filtered.map((cat) => (
                <div key={cat} className="flex justify-between items-center p-1.5 bg-muted/50 rounded-md mb-2">
                  {editingCategory?.oldName === cat ? (
                    <Input
                      value={editingCategory.newName}
                      onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                      className="h-8"
                      disabled={isSubmitting}
                    />
                  ) : (
                    <span className="font-semibold truncate" title={cat}>
                      {cat}
                    </span>
                  )}
                  <div className="flex gap-1">
                    {editingCategory?.oldName === cat ? (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleEditCategory} disabled={isSubmitting}>
                        <Save className="w-4 h-4 text-green-600" />
                      </Button>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingCategory({ oldName: cat, newName: cat })}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeletingCategory(cat)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingCategory} onOpenChange={() => setDeletingCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القسم "{deletingCategory}"؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذا القسم وجميع الأسئلة المرتبطة به بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategory} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
              {isSubmitting ? "جاري الحذف..." : "نعم، قم بالحذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

/* -------------------------------------------------------------
 * مكوّن منطقة رفع الملفات (Dropzone) + فحص JSON
 * ----------------------------------------------------------- */
const JsonDropzone: React.FC<{
  acceptLabel?: string;
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  hint?: string;
}> = ({ acceptLabel = "اختر ملف JSON", onFileSelected, disabled, hint }) => {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f) onFileSelected(f);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={clsx(
          "rounded-2xl border border-dashed p-6 text-center cursor-pointer transition-all",
          dragOver ? "bg-muted/60" : "bg-muted/30",
          disabled && "opacity-60 cursor-not-allowed"
        )}
        onClick={() => inputRef.current?.click()}
      >
        <div className="flex flex-col items-center gap-2">
          <FileUp className="h-6 w-6" />
          <p className="text-sm font-medium">اسحب الملف هنا أو انقر للاختيار</p>
          <p className="text-xs text-muted-foreground">{acceptLabel}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileSelected(f);
          }}
          disabled={disabled}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
};

/* -------------------------------------------------------------
 * المكوّن الرئيسي
 * ----------------------------------------------------------- */
const QuestionManagementTab: React.FC = () => {
  const { toast } = useToast();

  // الحالة العامة
  const [selectedGame, setSelectedGame] = useState<GameKey>("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [trapAnswerCategories, setTrapAnswerCategories] = useState<string[]>([]);
  const [merchantCategories, setMerchantCategories] = useState<string[]>([]);

  // رفع
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<{
    validCount: number;
    rejectedCount: number;
    duplicateInFileCount: number;
    sample?: any[];
  } | null>(null);

  // حذف
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deletionParams, setDeletionParams] = useState<DeletionParams | null>(null);
  const [deletionCount, setDeletionCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(false);

  // نماذج الحذف
  const [deleteCategory, setDeleteCategory] = useState("");
  const [deleteSearchTerm, setDeleteSearchTerm] = useState("");
  const [deleteAnswerSearchTerm, setDeleteAnswerSearchTerm] = useState("");
  const [deleteSimilarityCategory, setDeleteSimilarityCategory] = useState("");

  // عدّ شامل
  const [globalCounts, setGlobalCounts] = useState<Record<Exclude<GameKey, "">, number>>({
    "trap-answer": 0,
    "educated-merchant": 0,
    word_war: 0,
    prison: 0,
  });

  // لعرض مدير الأقسام
  const activeCategoryManager = useMemo<"trap-answer" | "educated-merchant" | null>(
    () => (selectedGame === "trap-answer" || selectedGame === "educated-merchant" ? selectedGame : null),
    [selectedGame]
  );

  // تحميل الأقسام + العدّ الأولى
  useEffect(() => {
    const fetchInitial = async () => {
      const [trapRes, merchantRes] = await Promise.all([getTrapAnswerCategories(), getEducatedMerchantCategories()]);
      if (trapRes?.success && trapRes.categories) setTrapAnswerCategories(trapRes.categories);
      if (merchantRes?.success && merchantRes.categories) setMerchantCategories(merchantRes.categories);

      // عدّ شامل لكل لعبة
      const [ta, em, ww, pr] = await Promise.all([
        countQuestions({ game: "trap-answer", all: true }),
        countQuestions({ game: "educated-merchant", all: true }),
        countQuestions({ game: "word_war", all: true }),
        countQuestions({ game: "prison", all: true }),
      ]);
      setGlobalCounts({
        "trap-answer": ta?.count ?? 0,
        "educated-merchant": em?.count ?? 0,
        word_war: ww?.count ?? 0,
        prison: pr?.count ?? 0,
      });
    };
    fetchInitial();
  }, []);

  /* ----------------------------- رفع المحتوى ----------------------------- */
  const handleGameSelection = (game: GameKey) => {
    setSelectedGame(game);
    setSelectedCategory("");
    setFile(null);
    setUploadPreview(null);
    setDeleteCategory("");
    setDeleteSearchTerm("");
    setDeleteAnswerSearchTerm("");
    setDeleteSimilarityCategory("");
  };

  const validateAndPreviewFile = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: "ملف كبير جدًا", description: "الحد الأقصى 5MB.", variant: "destructive" });
      return;
    }
    try {
      const text = await f.text();
      const json = JSON.parse(text);

      if (selectedGame === "trap-answer" || selectedGame === "educated-merchant") {
        const arr = asQuestionsArray(json);
        if (!arr) throw new Error("صيغة غير صحيحة. استخدم مصفوفة أو { questions: [...] }.");
        const parsed = TrapMerchantArraySchema.safeParse(arr);
        if (!parsed.success) throw new Error(parsed.error.errors?.[0]?.message || "JSON غير صالح.");

        // إزالة التكرار داخل الملف نفسه
        const cleaned = dedupeLocal(parsed.data, (q) => signature(q.question));
        setUploadPreview({
          validCount: cleaned.length,
          rejectedCount: parsed.data.length - cleaned.length,
          duplicateInFileCount: parsed.data.length - cleaned.length,
          sample: cleaned.slice(0, 3),
        });
      } else if (selectedGame === "word_war") {
        const arr = asWordsArray(json);
        if (!arr) throw new Error("صيغة غير صحيحة. استخدم مصفوفة أو { words: [...] }.");
        const parsed = WordWarArraySchema.safeParse(arr);
        if (!parsed.success) throw new Error(parsed.error.errors?.[0]?.message || "JSON غير صالح.");
        const cleaned = dedupeLocal(parsed.data, (w) => signature(w));
        setUploadPreview({ validCount: cleaned.length, rejectedCount: parsed.data.length - cleaned.length, duplicateInFileCount: parsed.data.length - cleaned.length, sample: cleaned.slice(0, 5) });
      } else if (selectedGame === "prison") {
        const arr = asQuestionsArray(json);
        if (!arr) throw new Error("صيغة غير صحيحة. استخدم مصفوفة أو { questions: [...] }.");
        const parsed = PrisonArraySchema.safeParse(arr);
        if (!parsed.success) throw new Error(parsed.error.errors?.[0]?.message || "JSON غير صالح.");
        const cleaned = dedupeLocal(parsed.data, (q) => signature(q.text));
        setUploadPreview({ validCount: cleaned.length, rejectedCount: parsed.data.length - cleaned.length, duplicateInFileCount: parsed.data.length - cleaned.length, sample: cleaned.slice(0, 5) });
      }

      setFile(f);
    } catch (e: any) {
      toast({ title: "تعذّر قراءة الملف", description: e?.message ?? "ملف JSON غير صالح.", variant: "destructive" });
      setFile(null);
      setUploadPreview(null);
    }
  };

  const getUploadHelperText = useCallback(() => {
    switch (selectedGame) {
      case "trap-answer":
        return "الملف: مصفوفة من الكائنات بكل عنصر { question, answer, dummyAnswers?: string[] }.";
      case "educated-merchant":
        return "الملف: مصفوفة { question, answer, dummyAnswers?: string[] } (الدمي اختيارية).";
      case "word_war":
        return "الملف: مصفوفة من الكلمات (strings).";
      case "prison":
        return "الملف: مصفوفة من الكائنات { text }.";
      default:
        return "اختر لعبة لرؤية التعليمات.";
    }
  }, [selectedGame]);

  const downloadTemplate = () => {
    let data: any;
    switch (selectedGame) {
      case "trap-answer":
      case "educated-merchant":
        data = [
          { question: "ما عاصمة فرنسا؟", answer: "باريس", dummyAnswers: ["روما", "مدريد"] },
          { question: "كم 2+2؟", answer: "4" },
        ];
        break;
      case "word_war":
        data = ["نخلة", "كوكب", "برمجة"];
        break;
      case "prison":
        data = [{ text: "اعترف بأصعب موقف مررت به." }, { text: "اختر لاعبًا واستبدل معه دورك." }];
        break;
      default:
        data = {};
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedGame || "template"}.template.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleQuestionUpload = async () => {
    if (!selectedGame) {
      toast({ title: "اختر لعبة أولًا", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "لا يوجد ملف", description: "اختر ملف JSON للرفع.", variant: "destructive" });
      return;
    }

    try {
      setIsUploading(true);
      const text = await file.text();
      const json = JSON.parse(text);
      let result: any;

      switch (selectedGame) {
        case "trap-answer": {
          if (!selectedCategory) throw new Error("اختر قسمًا لرفع الأسئلة إليه.");
          const arr = asQuestionsArray(json);
          if (!arr) throw new Error("صيغة غير صحيحة. استخدم مصفوفة أو { questions: [...] }.");
          const parsed = TrapMerchantArraySchema.parse(arr);
          result = await uploadTrapAnswerQuestionsFromJson(parsed, selectedCategory);
          break;
        }
        case "educated-merchant": {
          if (!selectedCategory) throw new Error("اختر قسمًا لرفع الأسئلة إليه.");
          const arr = asQuestionsArray(json);
          if (!arr) throw new Error("صيغة غير صحيحة. استخدم مصفوفة أو { questions: [...] }.");
          const parsed = TrapMerchantArraySchema.parse(arr);
          result = await uploadEducatedMerchantQuestionsFromJson(parsed, selectedCategory);
          break;
        }
        case "word_war": {
          const arr = asWordsArray(json);
          if (!arr) throw new Error("صيغة غير صحيحة. استخدم مصفوفة أو { words: [...] }.");
          const parsed = WordWarArraySchema.parse(arr);
          result = await uploadWordWarWordsFromJson(parsed);
          break;
        }
        case "prison": {
          const arr = asQuestionsArray(json);
          if (!arr) throw new Error("صيغة غير صحيحة. استخدم مصفوفة أو { questions: [...] }.");
          const parsed = PrisonArraySchema.parse(arr);
          result = await uploadPrisonQuestionsFromJson(parsed);
          break;
        }
        default:
          throw new Error("نوع لعبة غير مدعوم");
      }

      if (result?.success) {
        toast({ title: "تم الرفع", description: `تم رفع ${result.count ?? 0} عنصر بنجاح.` });
        setFile(null);
        setUploadPreview(null);
        // تحديث العدّ الإجمالي
        const updated = await countQuestions({ game: selectedGame as Exclude<GameKey, "">, all: true });
        setGlobalCounts((g) => ({ ...g, [selectedGame as Exclude<GameKey, "">]: updated?.count ?? g[selectedGame as Exclude<GameKey, "">] }));
      } else {
        throw new Error(result?.error || "فشل الرفع.");
      }
    } catch (e: any) {
      toast({ title: "خطأ في الرفع", description: e?.message ?? "تأكد من صحة الملف.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  /* ----------------------------- حذف المحتوى ----------------------------- */
  const handleDeleteClick = async (params: DeletionParams) => {
    const isValid = params.all || params.category || params.searchTerm || params.answerSearchTerm || params.duplicates;
    if (!isValid) return;
    setDeletionParams(params);

    // حاول حساب العدد قبل التأكيد (حيثما أمكن)
    setDeletionCount(null);
    setIsLoadingCount(true);
    try {
      if (params.all) {
        const c = await countQuestions({ game: params.game, all: true });
        setDeletionCount(c?.count ?? null);
      } else if (params.category) {
        const c = await countQuestions({ game: params.game, category: params.category });
        setDeletionCount(c?.count ?? null);
      } else if (params.searchTerm) {
        const c = await countQuestions({ game: params.game, searchTerm: params.searchTerm });
        setDeletionCount(c?.count ?? null);
      } else if (params.answerSearchTerm) {
        const c = await countQuestions({ game: params.game, answerSearchTerm: params.answerSearchTerm });
        setDeletionCount(c?.count ?? null);
      } else {
        // المكررات: لا عدّ مُسبق متاح من الباك-إند – نعرض رسالة عامة
        setDeletionCount(null);
      }
    } catch {
      setDeletionCount(null);
    } finally {
      setIsLoadingCount(false);
      setIsDialogOpen(true);
    }
  };

  const confirmDelete = async () => {
    if (!deletionParams) return;
    setIsDialogOpen(false);
    setIsDeleting(true);
    let result: { success?: boolean; count?: number; error?: string; message?: string } | undefined;
    try {
      if (deletionParams.duplicates) {
        if (deletionParams.game === "trap-answer" || deletionParams.game === "educated-merchant") {
          result = await deleteSimilarQuestions(deletionParams.game, deletionParams.category);
        } else if (deletionParams.game === "prison") {
          result = await deleteSimilarPrisonQuestions();
        }
      } else {
        result = await deleteQuestions(deletionParams as any);
      }

      if (result && result.error) {
        toast({ title: "خطأ", description: result.error, variant: "destructive" });
      } else if (result && result.success) {
        const msg = `تم حذف ${result.count ?? 0} عنصر. ${result.message || ""}`;
        toast({ title: "نجاح", description: msg });
        // تحديث العدّ الإجمالي
        const updated = await countQuestions({ game: deletionParams.game, all: true });
        setGlobalCounts((g) => ({ ...g, [deletionParams.game]: updated?.count ?? g[deletionParams.game] }));
      } else {
        toast({ title: "خطأ", description: "حدث خطأ غير متوقع أثناء الحذف.", variant: "destructive" });
      }
    } finally {
      setIsDeleting(false);
      setDeletionParams(null);
      setDeletionCount(null);
    }
  };

  /* ----------------------------- واجهات فرعية للحذف ----------------------------- */
  const currentCategoryList = useMemo(() => {
    if (selectedGame === "trap-answer") return trapAnswerCategories;
    if (selectedGame === "educated-merchant") return merchantCategories;
    return [];
  }, [selectedGame, trapAnswerCategories, merchantCategories]);

  const renderCategorizedGameDelete = () => (
    <div className="space-y-4">
      <div className="p-3 border rounded-2xl space-y-2">
        <Label>حذف حسب النص</Label>
        <div className="flex gap-2">
          <Input placeholder="نص السؤال..." value={deleteSearchTerm} onChange={(e) => setDeleteSearchTerm(e.target.value)} />
          <Button onClick={() => handleDeleteClick({ game: selectedGame as any, searchTerm: deleteSearchTerm })} disabled={!deleteSearchTerm.trim() || isDeleting} variant="destructive">
            حذف
          </Button>
        </div>
        <div className="flex gap-2">
          <Input placeholder="نص الجواب..." value={deleteAnswerSearchTerm} onChange={(e) => setDeleteAnswerSearchTerm(e.target.value)} />
          <Button onClick={() => handleDeleteClick({ game: selectedGame as any, answerSearchTerm: deleteAnswerSearchTerm })} disabled={!deleteAnswerSearchTerm.trim() || isDeleting} variant="destructive">
            حذف
          </Button>
        </div>
      </div>
      <div className="p-3 border rounded-2xl space-y-2">
        <Label>حذف حسب القسم</Label>
        <div className="flex items-center gap-2">
          <Select onValueChange={setDeleteCategory} value={deleteCategory}>
            <SelectTrigger>
              <SelectValue placeholder="اختر قسمًا لحذف كل أسئلته..." />
            </SelectTrigger>
            <SelectContent>
              {currentCategoryList.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => handleDeleteClick({ game: selectedGame as any, category: deleteCategory })} disabled={!deleteCategory || isDeleting || isLoadingCount} variant="destructive">
            {isLoadingCount ? <Loader2 className="animate-spin" /> : "حذف"}
          </Button>
        </div>
      </div>
      <div className="p-3 border rounded-2xl space-y-2">
        <h4 className="font-bold">حذف الأسئلة المكررة</h4>
        <p className="text-sm text-muted-foreground">سيتم فحص الأسئلة المتشابهة داخل قسم محدد مع الإبقاء على أحدث نسخة.</p>
        <div className="flex items-center gap-2">
          <Select onValueChange={setDeleteSimilarityCategory} value={deleteSimilarityCategory}>
            <SelectTrigger>
              <SelectValue placeholder="اختر قسمًا للفحص" />
            </SelectTrigger>
            <SelectContent>
              {currentCategoryList.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => handleDeleteClick({ game: selectedGame as any, category: deleteSimilarityCategory, duplicates: true })} disabled={!deleteSimilarityCategory || isDeleting} variant="destructive">
            <Sparkles className="ml-1 h-4 w-4" /> حذف المكررات
          </Button>
        </div>
      </div>
    </div>
  );

  const renderWordWarDelete = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="font-bold">حذف كل الكلمات</h4>
        <p className="text-sm text-destructive text-center p-2 bg-destructive/10 rounded-md">تحذير! هذا الإجراء سيحذف جميع كلمات لعبة حرب الكلمات.</p>
        <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: "word_war", all: true })} disabled={isDeleting}>
          <Trash2 className="mr-2 h-4 w-4" />
          {isDeleting ? "جاري حذف الكل..." : "تأكيد حذف جميع الكلمات"}
        </Button>
      </div>
      <div className="space-y-2 border rounded-2xl p-3">
        <h4 className="font-bold">حذف الكلمات المكررة</h4>
        <p className="text-sm text-muted-foreground">سيفحص جميع الكلمات ويحذف أي نسخ متطابقة 100%.</p>
        <Button
          variant="destructive"
          className="w-full"
          onClick={async () => {
            setIsDeleting(true);
            const result = await deleteDuplicateWords();
            if (result?.success) {
              toast({ title: "تم", description: `تم حذف ${result.count ?? 0} كلمة مكررة.` });
              const updated = await countQuestions({ game: "word_war", all: true });
              setGlobalCounts((g) => ({ ...g, word_war: updated?.count ?? g.word_war }));
            } else {
              toast({ title: "خطأ", description: result?.error ?? "تعذر الحذف.", variant: "destructive" });
            }
            setIsDeleting(false);
          }}
          disabled={isDeleting}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {isDeleting ? "جاري الفحص والحذف..." : "حذف الكلمات المكررة 100%"}
        </Button>
      </div>
    </div>
  );

  const renderPrisonDelete = () => (
    <div className="space-y-4">
      <div className="p-3 border rounded-2xl space-y-2">
        <h4 className="font-bold">حذف كل أسئلة السجن</h4>
        <p className="text-sm text-destructive text-center p-2 bg-destructive/10 rounded-md">تحذير! هذا الإجراء سيحذف جميع أسئلة لعبة السجن.</p>
        <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: "prison", all: true })} disabled={isDeleting}>
          <Trash2 className="mr-2 h-4 w-4" />
          {isDeleting ? "جاري حذف الكل..." : "تأكيد حذف جميع الأسئلة"}
        </Button>
      </div>
      <div className="p-3 border rounded-2xl space-y-2">
        <h4 className="font-bold">حذف أسئلة السجن المكررة</h4>
        <p className="text-sm text-muted-foreground">سيتم فحص الأسئلة المتشابهة وحذفها مع الإبقاء على أحدث نسخة.</p>
        <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: "prison", duplicates: true })} disabled={isDeleting}>
          <Sparkles className="mr-2 h-4 w-4" />
          {isDeleting ? "جاري الفحص..." : "حذف المكررات من السجن"}
        </Button>
      </div>
    </div>
  );

  const renderDeleteForm = () => {
    if (!selectedGame) {
      return (
        <div className="space-y-2">
          <Label htmlFor="game-select-delete">1. اختر اللعبة</Label>
          <Select onValueChange={(v) => handleGameSelection(v as GameKey)} value={selectedGame}>
            <SelectTrigger id="game-select-delete">
              <SelectValue placeholder="اختر لعبة لحذف محتوى منها..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trap-answer">الجواب المفخخ</SelectItem>
              <SelectItem value="educated-merchant">التاجر المتعلم</SelectItem>
              <SelectItem value="word_war">حرب الكلمات</SelectItem>
              <SelectItem value="prison">السجن</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (selectedGame === "trap-answer" || selectedGame === "educated-merchant") return renderCategorizedGameDelete();
    if (selectedGame === "word_war") return renderWordWarDelete();
    if (selectedGame === "prison") return renderPrisonDelete();
    return null;
  };

  const getDialogDescription = () => {
    if (!deletionParams) return "";
    if (deletionParams.duplicates) {
      if (deletionParams.game === "prison") return "سيتم فحص جميع أسئلة السجن وحذف المتشابه منها بناءً على بصمة النص. هل أنت متأكد؟";
      const gameName = deletionParams.game === "trap-answer" ? "الجواب المفخخ" : "التاجر المتعلم";
      return `سيتم فحص جميع الأسئلة في قسم "${deletionParams.category}" للعبة "${gameName}" وحذف المتشابه منها. متأكد؟`;
    }
    if (deletionParams.all) return "تحذير شديد! هذا الإجراء سيحذف جميع العناصر لهذه اللعبة بشكل دائم.";
    if (deletionParams.category) return `سيتم حذف ${deletionCount ?? "جميع"} الأسئلة من قسم "${deletionParams.category}" بشكل دائم.`;
    if (deletionParams.searchTerm) return `سيتم حذف كل الأسئلة التي تحتوي على "${deletionParams.searchTerm}". هل أنت متأكد؟`;
    if (deletionParams.answerSearchTerm) return `سيتم حذف كل الأسئلة التي جوابها يحتوي على "${deletionParams.answerSearchTerm}". هل أنت متأكد؟`;
    return "لا يمكن التراجع عن هذا الإجراء.";
  };

  /* ----------------------------- واجهة الرفع ----------------------------- */
  const renderUploadForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="game-select-upload">1. اختر اللعبة</Label>
        <Select onValueChange={(v) => handleGameSelection(v as GameKey)} value={selectedGame}>
          <SelectTrigger id="game-select-upload">
            <SelectValue placeholder="اختر لعبة لرفع محتوى لها..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trap-answer">الجواب المفخخ</SelectItem>
            <SelectItem value="educated-merchant">التاجر المتعلم</SelectItem>
            <SelectItem value="word_war">حرب الكلمات</SelectItem>
            <SelectItem value="prison">السجن</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(selectedGame === "trap-answer" || selectedGame === "educated-merchant") && (
        <div className="space-y-2">
          <Label htmlFor="category-select-upload">2. اختر القسم</Label>
          <Select onValueChange={setSelectedCategory} value={selectedCategory}>
            <SelectTrigger id="category-select-upload">
              <SelectValue placeholder={`اختر من أقسام ${selectedGame === "trap-answer" ? "الجواب المفخخ" : "التاجر المتعلم"}`} />
            </SelectTrigger>
            <SelectContent>
              {currentCategoryList.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>
          {(selectedGame === "trap-answer" || selectedGame === "educated-merchant") ? "3." : "2."} اختر ملف المحتوى (JSON)
        </Label>
        <JsonDropzone
          acceptLabel="ملفات .json فقط"
          onFileSelected={validateAndPreviewFile}
          disabled={!selectedGame}
          hint={getUploadHelperText()}
        />

        {file && (
          <div className="flex items-start justify-between gap-4 border rounded-2xl p-3 bg-muted/40">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="rounded-full">ملف</Badge>
                <span className="text-sm font-medium">{file.name}</span>
              </div>
              {uploadPreview && (
                <div className="text-xs text-muted-foreground">
                  <div>العناصر الصالحة: <b>{uploadPreview.validCount}</b></div>
                  {uploadPreview.rejectedCount > 0 && (
                    <div className="text-amber-600">مرفوض داخل الملف/مكرر داخليًا: {uploadPreview.rejectedCount}</div>
                  )}
                  {uploadPreview.sample && (
                    <details className="mt-1">
                      <summary className="cursor-pointer select-none">عرض عينة</summary>
                      <pre className="text-[10px] p-2 bg-background/50 rounded-md overflow-auto max-h-40">
                        {JSON.stringify(uploadPreview.sample, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="icon" onClick={downloadTemplate} title="تنزيل قالب">
                <Download className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => { setFile(null); setUploadPreview(null); }} title="إزالة">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Button onClick={handleQuestionUpload} disabled={isUploading || !file || !selectedGame || ((selectedGame === "trap-answer" || selectedGame === "educated-merchant") && !selectedCategory)} className="w-full">
        <Upload className="mr-2 h-4 w-4" />
        {isUploading ? "جاري الرفع..." : "رفع الملف"}
      </Button>
    </div>
  );

  return (
    <div dir="rtl" className="space-y-6">
      {/* بطاقة إحصاءات سريعة */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle>لوحة إدارة محتوى الألعاب</CardTitle>
            <CardDescription>رفع وحذف المحتوى، وإدارة الأقسام. الأرقام أدناه تُحدّث تلقائيًا بعد العمليات.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-2xl p-3 bg-muted/50">
                <div className="text-xs text-muted-foreground">الجواب المفخخ</div>
                <div className="text-2xl font-bold">{globalCounts["trap-answer"]}</div>
              </div>
              <div className="rounded-2xl p-3 bg-muted/50">
                <div className="text-xs text-muted-foreground">التاجر المتعلم</div>
                <div className="text-2xl font-bold">{globalCounts["educated-merchant"]}</div>
              </div>
              <div className="rounded-2xl p-3 bg-muted/50">
                <div className="text-xs text-muted-foreground">حرب الكلمات</div>
                <div className="text-2xl font-bold">{globalCounts.word_war}</div>
              </div>
              <div className="rounded-2xl p-3 bg-muted/50">
                <div className="text-xs text-muted-foreground">السجن</div>
                <div className="text-2xl font-bold">{globalCounts.prison}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 rounded-2xl">
          <CardHeader>
            <CardTitle>إدارة المحتوى</CardTitle>
            <CardDescription>اختر ما إذا كنت تريد الرفع أو الحذف.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="upload" className="w-full" onValueChange={() => handleGameSelection("") }>
              <TabsList className="grid w-full grid-cols-2 rounded-2xl">
                <TabsTrigger value="upload">رفع المحتوى</TabsTrigger>
                <TabsTrigger value="delete">حذف المحتوى</TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="pt-4">{renderUploadForm()}</TabsContent>
              <TabsContent value="delete" className="pt-4">{renderDeleteForm()}</TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="md:col-span-1 space-y-6">
          {activeCategoryManager && (
            <CategoryManager
              gameType={activeCategoryManager}
              categories={activeCategoryManager === "trap-answer" ? trapAnswerCategories : merchantCategories}
              setCategories={activeCategoryManager === "trap-answer" ? setTrapAnswerCategories : setMerchantCategories}
              onAdd={activeCategoryManager === "trap-answer" ? addTrapAnswerCategory : addEducatedMerchantCategory}
              onEdit={activeCategoryManager === "trap-answer" ? editTrapAnswerCategory : editEducatedMerchantCategory}
              onDelete={activeCategoryManager === "trap-answer" ? deleteTrapAnswerCategory : deleteEducatedMerchantCategory}
            />
          )}

          {/* تلميحات سريعة */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">نصائح سريعة</CardTitle>
              <CardDescription>لرفع أسرع وتجربة أنظف</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <div>• ينصح بإزالة التكرارات داخل الملف قبل الرفع – نقوم بذلك آليًا عند الإمكان.</div>
              <div>• استخدم زر «تنزيل قالب» لإنشاء هيكل JSON صحيح بسرعة.</div>
              <div>• قبل حذف قسم كامل، نحاول عرض عدد العناصر المتأثرة.</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* حوار التأكيد للحذف */}
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
            <AlertDialogDescription>
              {isLoadingCount ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جاري التحضير...</span>
              ) : (
                getDialogDescription()
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDialogOpen(false)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className={buttonVariants({ variant: "destructive" })} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="animate-spin" /> : "نعم، قم بالتأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuestionManagementTab;
