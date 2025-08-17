
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

// UI
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogContent, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { AspectRatio } from "@/components/ui/aspect-ratio";

// Icons
import { PlusCircle, Loader2, Edit, Trash2, Newspaper, Users, ChevronsUpDown, Bot, RotateCcw, BrainCircuit, Image as ImageIcon, Filter, SortAsc, SortDesc, Eye, EyeOff, CheckCircle2, XCircle, RefreshCw, Megaphone, UploadCloud, CheckCheck, Search } from "lucide-react";

// Types & helpers
import type { Article, AudienceGroup, UserProfile } from "@/types";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import {
  createArticle,
  getArticlesForAdmin,
  updateArticle,
  deleteArticle,
  getAudienceGroups,
  createAudienceGroup,
  addPlayerToAudienceGroup,
  deleteAudienceGroup,
  removePlayerFromAudienceGroup,
  runAiJournalist,
  deleteOldArticles,
} from "@/lib/actions/news";
import { adminSearchUsers } from "@/lib/actions/admin/users";
import { Timestamp } from "firebase/firestore";

// ────────────────────────────────────────────────────────────────────────────────
// Utilities
function clsx(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(" ");
}

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ────────────────────────────────────────────────────────────────────────────────
// Subcomponents
function StatCard({ title, value, icon: Icon, hint, tone = "default" }: { title: string; value: string | number; icon: any; hint?: string; tone?: "default" | "success" | "warn" | "danger" }) {
  const tones: Record<string, string> = {
    default: "bg-gradient-to-br from-muted/60 to-muted text-foreground",
    success: "bg-gradient-to-br from-emerald-100/20 to-emerald-100/10 text-emerald-700 dark:text-emerald-400",
    warn: "bg-gradient-to-br from-amber-100/20 to-amber-100/10 text-amber-700 dark:text-amber-400",
    danger: "bg-gradient-to-br from-rose-100/20 to-rose-100/10 text-rose-700 dark:text-rose-400",
  };
  return (
    <Card className={clsx("border-0 shadow-sm", tones[tone])}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground/80">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className="p-2 rounded-xl bg-background/60 shadow-sm">
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ArticleRow({
  article,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  article: Article;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onEdit: (a: Article) => void;
  onDelete: (a: Article) => void;
}) {
  const createdAtDate = article.createdAt instanceof Timestamp ? article.createdAt.toDate() : new Date(article.createdAt);

  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 hover:shadow-md transition-shadow">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/60 via-purple-500/60 to-pink-500/60 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-center gap-3 p-3">
        <Checkbox checked={selected} onCheckedChange={(v) => onToggle(article.id, Boolean(v))} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold truncate max-w-[60ch]">{article.title}</p>
            <Badge variant={article.isPublished ? "default" : "secondary"} className={clsx(article.isPublished ? "bg-emerald-600 hover:bg-emerald-700" : "")}>{article.isPublished ? "منشور" : "مسودة"}</Badge>
            {article.category && <Badge variant="outline">{article.category}</Badge>}
            {(article.audience?.length ?? 0) > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="cursor-help">
                      <Megaphone className="w-3 h-3 ml-1" />
                      {article.audience?.[0] === "public" ? "عام" : `${article.audience?.length} مجموعة`}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="text-xs">
                    {(article.audience || []).map((a) => (
                      <div key={a}>{a === "public" ? "عام" : a}</div>
                    ))}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground truncate">
            بواسطة {article.authorName} • {format(createdAtDate, "d MMM yyyy, h:mm a", { locale: ar })} • {formatDistanceToNow(createdAtDate, { addSuffix: true, locale: ar })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => onEdit(article)}>
                  <Edit className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>تعديل</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(article)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>حذف</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      {article.imageUrl && (
        <div className="px-3 pb-3">
          <AspectRatio ratio={16 / 6} className="rounded-lg overflow-hidden border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={article.imageUrl} alt="article cover" className="h-full w-full object-cover" />
          </AspectRatio>
        </div>
      )}
    </div>
  );
}


function AudienceMultiSelect({
  value,
  onChange,
  groups,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  groups: AudienceGroup[];
}) {
  const isChecked = (id: string) => value.includes(id);
  const toggle = (id: string) => {
    if (isChecked(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  };
  const display = () => {
    if (!value?.length || value[0] === "public") return "عام (لكل اللاعبين)";
    if (value.length === 1) return groups.find((g) => g.id === value[0])?.name || value[0];
    return `${value.length} مجموعات`;
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="justify-between w-full">
          <span>{display()}</span>
          <ChevronsUpDown className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>اختيار الجمهور</DialogTitle>
          <DialogDescription>اختر المجموعات التي سيظهر لها هذا المقال.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
          <div className="flex items-center justify-between rounded-md border p-2">
            <div className="space-y-1">
              <p className="font-medium">عام</p>
              <p className="text-xs text-muted-foreground">مرئي لجميع اللاعبين</p>
            </div>
            <Checkbox checked={isChecked("public")} onCheckedChange={(v) => (v ? onChange(["public"]) : onChange([]))} />
          </div>
          {groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between rounded-md border p-2">
              <div className="space-y-1">
                <p className="font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground">{g.members.length} عضو</p>
              </div>
              <Checkbox checked={isChecked(g.id)} onCheckedChange={() => toggle(g.id)} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>تم</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
export default function NewsTab() {
  const { toast } = useToast();
  const { userProfile } = useAuth();

  // Data
  const [articles, setArticles] = useState<Article[]>([]);
  const [audienceGroups, setAudienceGroups] = useState<AudienceGroup[]>([]);

  // UI state
  const [isFetching, setIsFetching] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [articleToDelete, setArticleToDelete] = useState<Article | null>(null);
  const [showDeleteOldArticlesDialog, setShowDeleteOldArticlesDialog] = useState(false);

  // Search / filter / sort
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Audience management
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<AudienceGroup | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchedUsers, setSearchedUsers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // AI journalist
  const [isGeneratingArticle, setIsGeneratingArticle] = useState(false);
  const [isDeletingOld, setIsDeletingOld] = useState(false);
  const [aiDirective, setAiDirective] = useState("");

  // Form
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>(["public"]);

  const fetchAllData = useCallback(async () => {
    setIsFetching(true);
    const [articlesResult, groupsResult] = await Promise.all([getArticlesForAdmin(), getAudienceGroups()]);

    if (articlesResult.success && articlesResult.data) {
      setArticles(articlesResult.data);
    } else {
      toast({ title: "خطأ", description: articlesResult.error, variant: "destructive" });
    }

    if (groupsResult.success && groupsResult.data) {
      setAudienceGroups(groupsResult.data);
    } else {
       toast({ title: "خطأ", description: groupsResult.error, variant: "destructive" });
    }
    
    setIsFetching(false);
  }, [toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const resetForm = () => {
    setTitle("");
    setContent("");
    setImageUrl("");
    setCategory("");
    setIsPublished(true);
    setSelectedAudiences(["public"]);
    setEditingArticle(null);
  };

  const handleOpenDialog = (article: Article | null) => {
    if (article) {
      setEditingArticle(article);
      setTitle(article.title);
      setContent(article.content);
      setCategory(article.category || "");
      setImageUrl(article.imageUrl || "");
      setIsPublished(article.isPublished);
      setSelectedAudiences(article.audience || ["public"]);
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleFormSubmit = async () => {
    if (!title.trim() || !content.trim() || !userProfile) {
      toast({ title: "الرجاء ملء العنوان والمحتوى", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    const articleData: Omit<Article, 'id' | 'createdAt'> = {
      title: title.trim(),
      content: content.trim(),
      category: category.trim(),
      imageUrl: imageUrl.trim(),
      isPublished,
      audience: selectedAudiences,
      authorName: userProfile.name,
      authorId: userProfile.uid,
    };
    
    const result = editingArticle ? await updateArticle(editingArticle.id, userProfile.uid, articleData) : await createArticle(articleData);

    if (result.success) {
      toast({ title: editingArticle ? "تم تحديث المقال بنجاح" : "تم إنشاء المقال بنجاح" });
      setIsDialogOpen(false);
      resetForm();
      fetchAllData();
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const handleDeleteArticle = async () => {
    if (!articleToDelete) return;
    setIsSubmitting(true);
    const result = await deleteArticle(articleToDelete.id, userProfile?.uid);
    if (result.success) {
      toast({ title: "تم حذف المقال" });
      setArticleToDelete(null);
      fetchAllData();
    } else {
      toast({ title: "خطأ في الحذف", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setIsSubmitting(true);
    await createAudienceGroup(newGroupName.trim());
    setNewGroupName("");
    fetchAllData();
    setIsSubmitting(false);
  };

  const handleAddPlayer = async (userId: string) => {
    if (!selectedGroup) return;
    setIsSubmitting(true);
    await addPlayerToAudienceGroup(selectedGroup.id, userId);
    fetchAllData();
    setSelectedGroup((prev) => (prev ? { ...prev, members: [...prev.members, userId] } : null));
    setIsSubmitting(false);
  };

  const handleRemovePlayer = async (userId: string) => {
    if (!selectedGroup) return;
    setIsSubmitting(true);
    await removePlayerFromAudienceGroup(selectedGroup.id, userId);
    fetchAllData();
    setSelectedGroup((prev) => (prev ? { ...prev, members: prev.members.filter((id) => id !== userId) } : null));
    setIsSubmitting(false);
  };

  const handleUserSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchedUsers([]);
      return;
    }
    setIsLoadingUsers(true);
    const users = await adminSearchUsers(term);
    setSearchedUsers(users);
    setIsLoadingUsers(false);
  };

  const handleRunAiJournalist = async () => {
    setIsGeneratingArticle(true);
    const result = await runAiJournalist(aiDirective.trim() || undefined);
    if (result.success) {
      toast({ title: "نجاح", description: `تم إنشاء ونشر مقال جديد بعنوان: "${result.data?.headline}"` });
      fetchAllData();
    } else {
      toast({ title: "فشل إنشاء المقال", description: result.error, variant: "destructive" });
    }
    setIsGeneratingArticle(false);
  };

  const handleDeleteOldArticlesConfirm = async () => {
    setIsDeletingOld(true);
    const result = await deleteOldArticles();
    if (result.success) {
      toast({ title: "نجاح", description: `تم حذف ${result.data?.deletedCount || 0} مقال قديم.` });
      fetchAllData();
    } else {
      toast({ title: "فشل الحذف", description: result.error, variant: "destructive" });
    }
    setIsDeletingOld(false);
    setShowDeleteOldArticlesDialog(false);
  };

  // Derived: filters / sort / stats
  const filtered = useMemo(() => {
    let list = [...articles];
    if (debouncedQ) {
      const term = debouncedQ.toLowerCase();
      list = list.filter((a) => a.title.toLowerCase().includes(term) || a.content.toLowerCase().includes(term) || (a.category || "").toLowerCase().includes(term));
    }
    if (statusFilter !== "all") list = list.filter((a) => (statusFilter === "published" ? a.isPublished : !a.isPublished));
    if (categoryFilter !== "all") list = list.filter((a) => (a.category || "") === categoryFilter);
    switch (sortBy) {
      case "newest":
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "oldest":
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "title":
        list.sort((a, b) => a.title.localeCompare(b.title, "ar"));
        break;
    }
    return list;
  }, [articles, debouncedQ, statusFilter, categoryFilter, sortBy]);

  const stats = useMemo(() => {
    const total = articles.length;
    const published = articles.filter((a) => a.isPublished).length;
    const drafts = total - published;
    const today = articles.filter((a) => {
      const d = new Date(a.createdAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    return { total, published, drafts, today };
  }, [articles]);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const selectAllVisible = () => setSelectedIds(filtered.map((a) => a.id));
  const clearSelection = () => setSelectedIds([]);

  const bulkPublish = async (publish: boolean) => {
    if (!selectedIds.length || !userProfile) return;
    setIsSubmitting(true);
    await Promise.all(
      selectedIds.map((id) => {
        const a = articles.find((x) => x.id === id);
        if (!a) return Promise.resolve();
        return updateArticle(id, userProfile.uid, { ...a, isPublished: publish });
      })
    );
    toast({ title: publish ? "تم نشر العناصر المحددة" : "تم تحويل العناصر لمسودات" });
    clearSelection();
    fetchAllData();
    setIsSubmitting(false);
  };

  const bulkDelete = async () => {
    if (!selectedIds.length) return;
    setIsSubmitting(true);
    await Promise.all(selectedIds.map((id) => deleteArticle(id, userProfile?.uid)));
    toast({ title: "تم حذف العناصر المحددة" });
    clearSelection();
    fetchAllData();
    setIsSubmitting(false);
  };

  const allCategories = useMemo(() => {
    const setCat = new Set<string>();
    articles.forEach((a) => a.category && setCat.add(a.category));
    return ["all", ...Array.from(setCat)];
  }, [articles]);

  // ──────────────────────────────────────────────────────────────────────────────
  return (
    <Tabs defaultValue="articles" className="space-y-4">
      {/* Header */}
      <Card className="border-0 shadow-none bg-transparent">
        <CardHeader className="pb-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Newspaper /> لوحة الأخبار والمجموعات
              </CardTitle>
              <CardDescription>إنشاء وتعديل المقالات، وإدارة مجموعات الجمهور، وأتمتة النشر.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={fetchAllData}>
                <RefreshCw className="ml-2" /> تحديث
              </Button>
              <Button onClick={() => handleOpenDialog(null)}>
                <PlusCircle className="ml-2" /> مقال جديد
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="إجمالي المقالات" value={stats.total} icon={Newspaper} />
        <StatCard title="منشور" value={stats.published} icon={CheckCircle2} tone="success" />
        <StatCard title="مسودات" value={stats.drafts} icon={EyeOff} tone="warn" />
        <StatCard title="اليوم" value={stats.today} icon={UploadCloud} />
      </div>

      {/* Tabs */}
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="articles">إدارة المقالات</TabsTrigger>
        <TabsTrigger value="groups">إدارة المجموعات</TabsTrigger>
        <TabsTrigger value="ai_journalist">المراسل الذكي</TabsTrigger>
      </TabsList>

      {/* Articles */}
      <TabsContent value="articles" className="space-y-4">
        {/* Toolbar */}
        <Card className="border-0 bg-gradient-to-br from-background to-muted/40">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-2">
                <div className="relative">
                  <Input placeholder="بحث في العنوان/المحتوى…" value={q} onChange={(e) => setQ(e.target.value)} className="pr-8" />
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <div className="md:col-span-1">
                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    <SelectItem value="published">منشور</SelectItem>
                    <SelectItem value="draft">مسودة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-1">
                <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="القسم" />
                  </SelectTrigger>
                  <SelectContent>
                    {allCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c === "all" ? "جميع الأقسام" : c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-1">
                <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="ترتيب" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">الأحدث</SelectItem>
                    <SelectItem value="oldest">الأقدم</SelectItem>
                    <SelectItem value="title">العنوان (أ-ي)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-1 flex items-center gap-2 justify-end">
                {selectedIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => bulkPublish(true)} disabled={isSubmitting}>
                      <Eye className="ml-1 w-4 h-4" /> نشر ({selectedIds.length})
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => bulkPublish(false)} disabled={isSubmitting}>
                      <EyeOff className="ml-1 w-4 h-4" /> مسودة
                    </Button>
                    <Button size="sm" variant="destructive" onClick={bulkDelete} disabled={isSubmitting}>
                      <Trash2 className="ml-1 w-4 h-4" /> حذف
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearSelection}>
                      إلغاء التحديد
                    </Button>
                  </div>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={selectAllVisible} disabled={!filtered.length}>
                          تحديد الكل
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>تحديد كل العناصر الظاهرة</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <ScrollArea className="h-[60vh] pr-2">
          <div className="space-y-3">
            {isFetching ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border p-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="mt-3 h-28 w-full" />
                </div>
              ))
            ) : filtered.length ? (
              filtered.map((article) => (
                <ArticleRow
                  key={article.id}
                  article={article}
                  selected={selectedIds.includes(article.id)}
                  onToggle={toggleSelect}
                  onEdit={handleOpenDialog}
                  onDelete={(a) => setArticleToDelete(a)}
                />
              ))
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center space-y-3">
                  <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="font-medium">لا توجد نتائج مطابقة</p>
                  <p className="text-sm text-muted-foreground">جرّب تعديل كلمات البحث أو تغيير الفلاتر.</p>
                  <div className="flex items-center justify-center gap-2">
                    <Button size="sm" onClick={() => setQ("")}>مسح البحث</Button>
                    <Button size="sm" variant="secondary" onClick={() => { setStatusFilter("all"); setCategoryFilter("all"); }}>إعادة الضبط</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      {/* Groups */}
      <TabsContent value="groups" className="space-y-4">
        <Card className="bg-gradient-to-br from-background to-muted/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users /> إدارة المجموعات</CardTitle>
            <CardDescription>أنشئ مجموعات جمهور، وأضِف لاعبين لعرض مقالات مخصّصة لهم.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="new-group">إنشاء مجموعة جديدة</Label>
              <div className="flex gap-2 mt-1">
                <Input id="new-group" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="اسم المجموعة…" />
                <Button onClick={handleCreateGroup} disabled={isSubmitting}>
                  <PlusCircle className="ml-2" /> إنشاء
                </Button>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>المجموعات الحالية</Label>
              <ScrollArea className="h-[55vh] pr-2">
                <div className="space-y-2">
                  {audienceGroups.map((group) => (
                    <Collapsible key={group.id}>
                      <div className="flex items-center justify-between p-3 rounded-xl border bg-card/70">
                        <div className="space-y-1">
                          <p className="font-bold">{group.name}</p>
                          <p className="text-xs text-muted-foreground">{group.members.length} أعضاء</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="destructive" size="icon" className="h-8 w-8" onClick={async () => { await deleteAudienceGroup(group.id); fetchAllData(); setSelectedGroup(null); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedGroup(group)}>
                              <ChevronsUpDown className="h-4 h-4" />
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>
                      <CollapsibleContent className="p-3 border rounded-b-xl">
                        {selectedGroup?.id === group.id && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <h4 className="font-semibold">إضافة لاعب للمجموعة</h4>
                              <Input placeholder="ابحث بالاسم…" value={searchTerm} onChange={(e) => handleUserSearch(e.target.value)} />
                              <div className="space-y-1 max-h-40 overflow-y-auto">
                                {isLoadingUsers ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  searchedUsers
                                    .filter((u) => !group.members.includes(u.uid))
                                    .map((user) => (
                                      <div key={user.uid} className="flex items-center justify-between p-2 rounded-md border bg-background">
                                        <div className="flex items-center gap-2">
                                          <PlayerAvatar avatarId={user.avatarId} className="w-6 h-6" />
                                          <span className="text-sm">{user.name}</span>
                                        </div>
                                        <Button size="sm" variant="outline" onClick={() => handleAddPlayer(user.uid)}>
                                          إضافة
                                        </Button>
                                      </div>
                                    ))
                                )}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <h4 className="font-semibold">الأعضاء الحاليون</h4>
                              <div className="space-y-1 max-h-40 overflow-y-auto">
                                {group.members.map((userId) => {
                                  const member = searchedUsers.find((u) => u.uid === userId) || { name: userId.substring(0, 5), avatarId: "Avatar00.png" } as UserProfile;
                                  return (
                                    <div key={userId} className="flex items-center justify-between p-2 rounded-md border bg-background">
                                      <div className="flex items-center gap-2">
                                        <PlayerAvatar avatarId={member.avatarId} className="w-6 h-6" />
                                        <span className="text-sm">{member.name}</span>
                                      </div>
                                      <Button size="sm" variant="destructive" onClick={() => handleRemovePlayer(userId)}>
                                        إزالة
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* AI Journalist */}
      <TabsContent value="ai_journalist">
        <Card className="bg-gradient-to-br from-background to-muted/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bot /> المراسل الصحفي الذكي</CardTitle>
            <CardDescription>ولّد مقالات تلقائياً ونظّف الأرشيف القديم.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ai-directive">توجيه (اختياري)</Label>
                <Input id="ai-directive" value={aiDirective} onChange={(e) => setAiDirective(e.target.value)} placeholder="مثال: ركّز على بطولة هذا الأسبوع والصراع بين س و ص" />
                <Button className="w-full mt-1" onClick={handleRunAiJournalist} disabled={isGeneratingArticle}>
                  {isGeneratingArticle ? <Loader2 className="animate-spin" /> : <BrainCircuit className="ml-2" />} توليد مقال
                </Button>
              </div>
              <div className="rounded-xl border p-3 bg-card/70">
                <p className="text-sm text-muted-foreground">تلميحات سريعة:</p>
                <ul className="list-disc pr-5 text-sm mt-2 space-y-1">
                  <li>اكتب كلمات مفتاحية (أسماء لاعبين/بطولات) ليدمجها الذكاء الاصطناعي.</li>
                  <li>استخدم لهجة الخبر أو المقال التحليلي كما تريد.</li>
                  <li>يمكنك تعديل المقال بعد إنشائه من تبويب "إدارة المقالات".</li>
                </ul>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-destructive">صيانة الجريدة</Label>
              <p className="text-xs text-muted-foreground">حذف كل المقالات الأقدم من 7 أيام لتنظيف قاعدة البيانات.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" onClick={() => setShowDeleteOldArticlesDialog(true)} disabled={isDeletingOld}>
                  <RotateCcw className="ml-2" /> {isDeletingOld ? <Loader2 className="animate-spin" /> : "حذف المقالات القديمة"}
                </Button>
                <Button variant="outline" onClick={fetchAllData}>
                  <RefreshCw className="ml-2" /> تحديث القائمة
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Create/Edit Article Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{editingArticle ? "تعديل المقال" : "مقال جديد"}</DialogTitle>
            <DialogDescription>أدخل تفاصيل المقال ثم احفظ.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="title" className="text-right">العنوان</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="category" className="text-right">القسم</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="اختر قسمًا…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="أخبار عامة">أخبار عامة</SelectItem>
                  <SelectItem value="مقالات اللاعبين">مقالات اللاعبين</SelectItem>
                  <SelectItem value="مقالات إدارية">مقالات إدارية</SelectItem>
                  <SelectItem value="أخبار اللعبة">أخبار اللعبة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="imageUrl" className="text-right">رابط الصورة</Label>
              <div className="col-span-3 space-y-2">
                <Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="اختياري" />
                {imageUrl ? (
                  <AspectRatio ratio={16 / 9} className="rounded-md overflow-hidden border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="preview" className="w-full h-full object-cover" />
                  </AspectRatio>
                ) : (
                  <div className="text-xs text-muted-foreground">لن تظهر صورة في حال تركه فارغًا.</div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="content" className="text-right pt-2">المحتوى</Label>
              <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} className="col-span-3" rows={10} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">الجمهور</Label>
              <div className="col-span-3">
                <AudienceMultiSelect value={selectedAudiences} onChange={setSelectedAudiences} groups={audienceGroups} />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="published" className="text-right">الحالة</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Switch id="published" checked={isPublished} onCheckedChange={setIsPublished} />
                <span>{isPublished ? "منشور" : "مسودة (مخفي)"}</span>
              </div>
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between">
            <DialogClose asChild>
              <Button variant="outline">إلغاء</Button>
            </DialogClose>
            <Button onClick={handleFormSubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!articleToDelete} onOpenChange={() => setArticleToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف مقال "{articleToDelete?.title}"؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArticleToDelete(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDeleteArticle} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Old Articles */}
      <AlertDialog open={showDeleteOldArticlesDialog} onOpenChange={setShowDeleteOldArticlesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المقالات القديمة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف جميع المقالات التي يزيد عمرها عن 7 أيام؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOldArticlesConfirm} disabled={isDeletingOld} className="bg-destructive hover:bg-destructive/90">
              {isDeletingOld ? <Loader2 className="animate-spin" /> : "نعم، قم بالحذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}
