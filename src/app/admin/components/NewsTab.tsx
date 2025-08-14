
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { PlusCircle, Loader2, Edit, Trash2, Newspaper, Users, ChevronsUpDown, Bot, RotateCcw, BrainCircuit, Image as ImageIcon } from 'lucide-react';
import type { Article, AudienceGroup, UserProfile } from '@/types';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminSearchUsers } from '@/lib/actions/admin';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogContent, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { createArticle, getArticlesForAdmin, updateArticle, deleteArticle, getAudienceGroups, createAudienceGroup, addPlayerToAudienceGroup, deleteAudienceGroup, removePlayerFromAudienceGroup, runAiJournalist, deleteOldArticles } from '@/lib/actions/news';

export default function NewsTab() {
    const { toast } = useToast();
    const { userProfile } = useAuth();
    const [articles, setArticles] = useState<Article[]>([]);
    const [audienceGroups, setAudienceGroups] = useState<AudienceGroup[]>([]);
    const [isFetching, setIsFetching] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingArticle, setEditingArticle] = useState<Article | null>(null);

    // Form states
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [isPublished, setIsPublished] = useState(true);
    const [selectedAudiences, setSelectedAudiences] = useState<string[]>(['public']);

    // Deletion dialog state
    const [articleToDelete, setArticleToDelete] = useState<Article | null>(null);
    const [showDeleteOldArticlesDialog, setShowDeleteOldArticlesDialog] = useState(false);


    // Audience management states
    const [newGroupName, setNewGroupName] = useState("");
    const [selectedGroup, setSelectedGroup] = useState<AudienceGroup | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchedUsers, setSearchedUsers] = useState<UserProfile[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    
    // AI Journalist State
    const [isGeneratingArticle, setIsGeneratingArticle] = useState(false);
    const [isDeletingOld, setIsDeletingOld] = useState(false);
    const [aiDirective, setAiDirective] = useState('');


    const fetchAllData = useCallback(async () => {
        setIsFetching(true);
        const [articlesResult, groupsResult] = await Promise.all([
            getArticlesForAdmin(),
            getAudienceGroups()
        ]);

        if (articlesResult.success && articlesResult.articles) {
            setArticles(articlesResult.articles);
        } else {
            toast({ title: "خطأ", description: articlesResult.error, variant: 'destructive' });
        }
        
        setAudienceGroups(groupsResult);
        setIsFetching(false);
    }, [toast]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    const resetForm = () => {
        setTitle('');
        setContent('');
        setImageUrl('');
        setCategory('');
        setIsPublished(true);
        setSelectedAudiences(['public']);
        setEditingArticle(null);
    };

    const handleOpenDialog = (article: Article | null) => {
        if (article) {
            setEditingArticle(article);
            setTitle(article.title);
            setContent(article.content);
            setCategory(article.category || '');
            setImageUrl(article.imageUrl || '');
            setIsPublished(article.isPublished);
            setSelectedAudiences(article.audience || ['public']);
        } else {
            resetForm();
        }
        setIsDialogOpen(true);
    };

    const handleFormSubmit = async () => {
        if (!title.trim() || !content.trim() || !userProfile) {
            toast({ title: "الرجاء ملء العنوان والمحتوى", variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);
        const articleData = {
            title: title.trim(),
            content: content.trim(),
            category: category.trim(),
            imageUrl: imageUrl.trim(),
            isPublished,
            audience: selectedAudiences,
            authorName: userProfile.name,
            authorId: userProfile.uid,
        };

        const result = editingArticle
            ? await updateArticle(editingArticle.id, articleData)
            : await createArticle(articleData);

        if (result.success) {
            toast({ title: editingArticle ? "تم تحديث المقال بنجاح" : "تم إنشاء المقال بنجاح" });
            setIsDialogOpen(false);
            resetForm();
            fetchAllData(); // Refresh list
        } else {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };

    const handleDeleteArticle = async () => {
        if (!articleToDelete) return;

        setIsSubmitting(true);
        const result = await deleteArticle(articleToDelete.id);
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
        // Refresh selected group view
        setSelectedGroup(prev => prev ? { ...prev, members: [...prev.members, userId] } : null);
        setIsSubmitting(false);
    }
    
    const handleRemovePlayer = async (userId: string) => {
        if (!selectedGroup) return;
        setIsSubmitting(true);
        await removePlayerFromAudienceGroup(selectedGroup.id, userId);
        fetchAllData();
        setSelectedGroup(prev => prev ? { ...prev, members: prev.members.filter(id => id !== userId) } : null);
        setIsSubmitting(false);
    }

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
            toast({ title: "نجاح", description: `تم إنشاء ونشر مقال جديد بنجاح بعنوان: "${result.article?.headline}"` });
            fetchAllData();
        } else {
            toast({ title: "فشل إنشاء المقال", description: result.error, variant: 'destructive' });
        }
        setIsGeneratingArticle(false);
    };
    
    const handleDeleteOldArticlesConfirm = async () => {
        setIsDeletingOld(true);
        const result = await deleteOldArticles();
        if (result.success) {
            toast({ title: "نجاح", description: `تم حذف ${result.deletedCount || 0} مقال قديم بنجاح.` });
            fetchAllData();
        } else {
            toast({ title: "فشل الحذف", description: result.error, variant: 'destructive' });
        }
        setIsDeletingOld(false);
        setShowDeleteOldArticlesDialog(false);
    };



    return (
        <Tabs defaultValue="articles">
            <CardHeader className='pb-2'>
                <div className="flex justify-between items-start">
                     <div>
                        <CardTitle className="flex items-center gap-2"><Newspaper /> إدارة الأخبار والمجموعات</CardTitle>
                        <CardDescription>إنشاء وتعديل وحذف المقالات، وإدارة مجموعات النشر المخصصة.</CardDescription>
                     </div>
                     <Button onClick={() => handleOpenDialog(null)}>
                        <PlusCircle className="ml-2" /> مقال جديد
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <TabsList className="grid w-full grid-cols-3 mt-4">
                    <TabsTrigger value="articles">إدارة المقالات</TabsTrigger>
                    <TabsTrigger value="groups">إدارة المجموعات</TabsTrigger>
                    <TabsTrigger value="ai_journalist">المراسل الذكي</TabsTrigger>
                </TabsList>
            
                <TabsContent value="articles" className="p-0 pt-4">
                    <ScrollArea className="h-96">
                        <div className="space-y-3 pr-4">
                            {isFetching ? (
                                <div className="text-center p-8"><Loader2 className="animate-spin" /></div>
                            ) : articles.length > 0 ? (
                                articles.map(article => (
                                    <div key={article.id} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                                        <div>
                                            <p className="font-bold">{article.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                بواسطة {article.authorName} - {format(article.createdAt, 'd MMMM yyyy', { locale: ar })} -{' '}
                                                <span className={article.isPublished ? 'text-green-500' : 'text-yellow-500'}>
                                                    {article.isPublished ? 'منشور' : 'مسودة'}
                                                </span>
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(article)}><Edit className="w-4 h-4" /></Button>
                                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setArticleToDelete(article)}><Trash2 className="w-4 h-4" /></Button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-muted-foreground p-8">لا توجد مقالات لعرضها.</p>
                            )}
                        </div>
                    </ScrollArea>
                </TabsContent>
                <TabsContent value="groups" className="p-0 pt-4">
                    <div className="space-y-4">
                         <div>
                            <Label htmlFor="new-group">إنشاء مجموعة جديدة</Label>
                            <div className="flex gap-2 mt-1">
                                <Input id="new-group" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="اسم المجموعة..." />
                                <Button onClick={handleCreateGroup} disabled={isSubmitting}><PlusCircle /></Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                             <Label>المجموعات الحالية</Label>
                             <ScrollArea className="h-80">
                                 <div className="space-y-2 pr-4">
                                 {audienceGroups.map(group => (
                                     <Collapsible key={group.id}>
                                         <div className="flex items-center justify-between p-2 bg-muted rounded-md">
                                             <span className="font-bold">{group.name} ({group.members.length} أعضاء)</span>
                                            <div className="flex items-center">
                                                 <Button variant="destructive" size="icon" className="h-7 w-7" onClick={async () => { await deleteAudienceGroup(group.id); fetchAllData(); setSelectedGroup(null); }}><Trash2 className="w-4 h-4"/></Button>
                                                 <CollapsibleTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedGroup(group)}>
                                                        <ChevronsUpDown className="h-4 w-4" />
                                                    </Button>
                                                </CollapsibleTrigger>
                                            </div>
                                         </div>
                                         <CollapsibleContent className="p-3 border rounded-b-md">
                                            {selectedGroup?.id === group.id && (
                                                <div className="space-y-3">
                                                    <h4 className="font-semibold">إضافة لاعب للمجموعة</h4>
                                                    <Input placeholder="ابحث بالاسم..." value={searchTerm} onChange={e => handleUserSearch(e.target.value)} />
                                                    <div className="space-y-1 max-h-32 overflow-y-auto">
                                                        {isLoadingUsers ? <Loader2 className="animate-spin" /> :
                                                         searchedUsers.filter(u => !group.members.includes(u.uid)).map(user => (
                                                            <div key={user.uid} className="flex items-center justify-between p-1 bg-background rounded">
                                                                <div className="flex items-center gap-2">
                                                                    <PlayerAvatar avatarId={user.avatarId} className="w-6 h-6"/>
                                                                    <span className="text-sm">{user.name}</span>
                                                                </div>
                                                                <Button size="sm" variant="outline" onClick={() => handleAddPlayer(user.uid)}>إضافة</Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <h4 className="font-semibold pt-2 border-t">الأعضاء الحاليون</h4>
                                                    <div className="space-y-1 max-h-32 overflow-y-auto">
                                                        {group.members.map(userId => {
                                                            const member = searchedUsers.find(u => u.uid === userId) || { name: userId.substring(0, 5), avatarId: 'Avatar00.png' };
                                                            return (
                                                                <div key={userId} className="flex items-center justify-between p-1 bg-background rounded">
                                                                     <div className="flex items-center gap-2">
                                                                        <PlayerAvatar avatarId={member.avatarId} className="w-6 h-6"/>
                                                                        <span className="text-sm">{member.name}</span>
                                                                    </div>
                                                                    <Button size="sm" variant="destructive" onClick={() => handleRemovePlayer(userId)}>إزالة</Button>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                         </CollapsibleContent>
                                     </Collapsible>
                                 ))}
                                 </div>
                             </ScrollArea>
                        </div>
                    </div>
                </TabsContent>
                 <TabsContent value="ai_journalist" className="p-0 pt-4">
                    <Card className="bg-muted/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Bot /> المراسل الصحفي الذكي</CardTitle>
                            <CardDescription>أدوات لأتمتة إنشاء محتوى الجريدة والحفاظ على نظافتها.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div>
                                <h4 className="font-bold">توليد مقال اليوم</h4>
                                <p className="text-xs text-muted-foreground mb-2">سيقوم الذكاء الاصطناعي بتحليل الأحداث الأخيرة وكتابة مقال جديد عنها.</p>
                                <div className="space-y-2">
                                    <Label htmlFor="ai-directive">توجيه (اختياري)</Label>
                                    <Input id="ai-directive" value={aiDirective} onChange={e => setAiDirective(e.target.value)} placeholder="مثال: ركز على الصراع بين اللاعب س واللاعب ص" />
                                </div>
                                <Button className="w-full mt-2" onClick={handleRunAiJournalist} disabled={isGeneratingArticle}>
                                    {isGeneratingArticle ? <Loader2 className="animate-spin" /> : <BrainCircuit className='ml-2'/>}
                                    توليد مقال
                                </Button>
                             </div>
                             <div className="pt-4 border-t">
                                <h4 className="font-bold text-destructive">صيانة الجريدة</h4>
                                <p className="text-xs text-muted-foreground mb-2">حذف جميع المقالات التي تم نشرها قبل أكثر من 7 أيام لتنظيف قاعدة البيانات.</p>
                                 <Button className="w-full" variant="destructive" onClick={() => setShowDeleteOldArticlesDialog(true)} disabled={isDeletingOld}>
                                    <RotateCcw className="ml-2" />
                                    {isDeletingOld ? <Loader2 className="animate-spin" /> : 'حذف المقالات القديمة'}
                                </Button>
                             </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </CardContent>


            {/* Create/Edit Article Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader><DialogTitle>{editingArticle ? 'تعديل المقال' : 'مقال جديد'}</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="title" className="text-right">العنوان</Label>
                            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="category" className="text-right">القسم</Label>
                             <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="اختر قسمًا..." />
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
                            <Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="col-span-3" placeholder="اختياري" />
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label htmlFor="content" className="text-right pt-2">المحتوى</Label>
                            <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} className="col-span-3" rows={10} />
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="audience" className="text-right">الجمهور</Label>
                             <Select value={selectedAudiences[0]} onValueChange={val => setSelectedAudiences([val])}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="اختر الجمهور..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="public">عام (لكل اللاعبين)</SelectItem>
                                    {audienceGroups.map(group => (
                                        <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="published" className="text-right">الحالة</Label>
                            <div className="col-span-3 flex items-center gap-2">
                                <Switch id="published" checked={isPublished} onCheckedChange={setIsPublished} />
                                <span>{isPublished ? 'منشور' : 'مسودة (مخفي)'}</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
                        <Button onClick={handleFormSubmit} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'حفظ'}
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
                            هل أنت متأكد من رغبتك في حذف مقال "{articleToDelete?.title}"؟ لا يمكن التراجع عن هذا الإجراء.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setArticleToDelete(null)}>إلغاء</Button>
                        <Button variant="destructive" onClick={handleDeleteArticle} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'حذف'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            {/* Delete Old Articles Confirmation */}
            <AlertDialog open={showDeleteOldArticlesDialog} onOpenChange={setShowDeleteOldArticlesDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد حذف المقالات القديمة</AlertDialogTitle>
                  <AlertDialogDescription>
                    هل أنت متأكد من رغبتك في حذف جميع المقالات التي يزيد عمرها عن 7 أيام؟ لا يمكن التراجع عن هذا الإجراء.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteOldArticlesConfirm} disabled={isDeletingOld} className="bg-destructive hover:bg-destructive/90">
                    {isDeletingOld ? <Loader2 className="animate-spin"/> : "نعم، قم بالحذف"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </Tabs>
    );
}
