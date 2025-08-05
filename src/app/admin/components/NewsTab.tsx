
"use client";

import { useState, useEffect } from 'react';
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
import { PlusCircle, Loader2, Edit, Trash2, Newspaper } from 'lucide-react';
import { createArticle, getArticlesForAdmin, updateArticle, deleteArticle } from '@/lib/actions/news';
import type { Article } from '@/types';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function NewsTab() {
    const { toast } = useToast();
    const { userProfile } = useAuth();
    const [articles, setArticles] = useState<Article[]>([]);
    const [isFetching, setIsFetching] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingArticle, setEditingArticle] = useState<Article | null>(null);

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [isPublished, setIsPublished] = useState(true);
    const [articleToDelete, setArticleToDelete] = useState<Article | null>(null);

    const fetchArticles = async () => {
        setIsFetching(true);
        const result = await getArticlesForAdmin();
        if (result.success && result.articles) {
            setArticles(result.articles);
        } else {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
        setIsFetching(false);
    };

    useEffect(() => {
        fetchArticles();
    }, []);

    const resetForm = () => {
        setTitle('');
        setContent('');
        setImageUrl('');
        setIsPublished(true);
        setEditingArticle(null);
    };

    const handleOpenDialog = (article: Article | null) => {
        if (article) {
            setEditingArticle(article);
            setTitle(article.title);
            setContent(article.content);
            setImageUrl(article.imageUrl || '');
            setIsPublished(article.isPublished);
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
            imageUrl: imageUrl.trim(),
            isPublished,
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
            fetchArticles(); // Refresh list
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
            fetchArticles();
        } else {
            toast({ title: "خطأ في الحذف", description: result.error, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2"><Newspaper /> إدارة الأخبار</CardTitle>
                        <CardDescription>إنشاء وتعديل وحذف مقالات الجريدة.</CardDescription>
                    </div>
                    <Button onClick={() => handleOpenDialog(null)}>
                        <PlusCircle className="ml-2" /> مقال جديد
                    </Button>
                </CardHeader>
                <CardContent>
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
                </CardContent>
            </Card>

            {/* Create/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>{editingArticle ? 'تعديل المقال' : 'مقال جديد'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="title" className="text-right">العنوان</Label>
                            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="col-span-3" />
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
        </>
    );
}
