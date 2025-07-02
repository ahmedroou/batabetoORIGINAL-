
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { uploadQuestionsFromJson, deleteQuestions, countQuestions } from '@/app/actions';
import { Upload, ArrowLeft, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


type DeletionParams = { category?: string; searchTerm?: string; all?: boolean };

export default function AdminPage() {
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const { toast } = useToast();
    const router = useRouter();
    const { userProfile, loading } = useAuth();
    
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteCategory, setDeleteCategory] = useState('');
    const [deleteSearchTerm, setDeleteSearchTerm] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [deletionParams, setDeletionParams] = useState<DeletionParams | null>(null);
    const [deletionCount, setDeletionCount] = useState<number | null>(null);

    useEffect(() => {
        if (!loading && !userProfile?.isAdmin) {
            toast({
                title: 'غير مصرح لك',
                description: 'يجب أن تكون أدمن للوصول لهذه الصفحة.',
                variant: 'destructive',
            });
            router.push('/');
        }
    }, [userProfile, loading, router, toast]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            setSelectedFile(event.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            toast({
                title: 'لم يتم تحديد ملف',
                description: 'الرجاء اختيار ملف JSON لرفعه.',
                variant: 'destructive',
            });
            return;
        }

        setIsUploading(true);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') {
                    throw new Error("Failed to read file.");
                }
                const json = JSON.parse(text);

                if (!json.questions || !Array.isArray(json.questions)) {
                    toast({
                        title: 'تنسيق الملف غير صحيح',
                        description: 'يجب أن يحتوي ملف JSON على مفتاح "questions" بداخله مصفوفة من كائنات الأسئلة.',
                        variant: 'destructive',
                    });
                    setIsUploading(false);
                    return;
                }

                const questions: { text: string; category: string }[] = json.questions;
                 if (!questions.every(q => q && typeof q.text === 'string' && typeof q.category === 'string')) {
                    toast({
                        title: 'تنسيق الأسئلة غير صحيح',
                        description: 'كل سؤال في المصفوفة يجب أن يكون كائنًا يحتوي على مفتاح "text" و "category" كنصوص.',
                        variant: 'destructive',
                    });
                    setIsUploading(false);
                    return;
                }
                
                const result = await uploadQuestionsFromJson(questions);

                if (result.success) {
                    toast({
                        title: 'نجاح',
                        description: `تم رفع ${result.count} سؤال بنجاح.`,
                    });
                    setSelectedFile(null);
                } else {
                    toast({
                        title: 'خطأ',
                        description: result.error,
                        variant: 'destructive',
                    });
                }
            } catch (error) {
                toast({
                    title: 'خطأ في تحليل الملف',
                    description: 'تأكد من أن الملف هو ملف JSON صالح.',
                    variant: 'destructive',
                });
            } finally {
                setIsUploading(false);
            }
        };
        reader.onerror = () => {
             toast({
                title: 'خطأ في قراءة الملف',
                description: 'لم نتمكن من قراءة الملف المحدد.',
                variant: 'destructive',
            });
            setIsUploading(false);
        };
        reader.readAsText(selectedFile);
    };

    const handleDeleteClick = async (params: DeletionParams) => {
        const isValid = params.all || (params.category && params.category.trim()) || (params.searchTerm && params.searchTerm.trim());
        if (!isValid) return;

        setIsDeleting(true);
        setDeletionParams(params);

        const countResult = await countQuestions(params);
        
        setIsDeleting(false);

        if (countResult.error) {
            toast({ title: "خطأ", description: countResult.error, variant: "destructive" });
            return;
        }

        if (countResult.count === 0) {
            toast({
                title: "لا يوجد ما يمكن حذفه",
                description: "لم يتم العثور على أسئلة تطابق المعايير المحددة.",
            });
            return;
        }
        
        setDeletionCount(countResult.count);
        setIsDialogOpen(true);
    };


    const confirmDelete = async () => {
        if (!deletionParams) return;
        
        setIsDeleting(true);
        const result = await deleteQuestions(deletionParams);
        setIsDeleting(false);
        setIsDialogOpen(false);

        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        } else if (result.success) {
            toast({ title: "نجاح", description: `تم حذف ${result.count} سؤال بنجاح. ${result.message || ''}` });
        }
        setDeleteCategory('');
        setDeleteSearchTerm('');
        setDeletionParams(null);
        setDeletionCount(null);
    };
    
    if (loading || !userProfile?.isAdmin) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/40">
                <Card className="w-full max-w-lg p-6 text-center">
                    <CardHeader>
                        <CardTitle>جاري التحقق من الصلاحيات...</CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </CardContent>
                </Card>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen flex-col items-center p-4 bg-muted/40">
            <div className="w-full max-w-lg space-y-8 py-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>لوحة تحكم الأدمن</span>
                             <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                                <ArrowLeft />
                            </Button>
                        </CardTitle>
                        <CardDescription>
                            قم برفع مجموعة جديدة من الأسئلة إلى قاعدة البيانات.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="json-upload">ملف الأسئلة (JSON)</Label>
                            <Input id="json-upload" type="file" accept=".json" onChange={handleFileChange} />
                            <p className="text-xs text-muted-foreground">
                                يجب أن يحتوي الملف على مفتاح `questions` بداخله مصفوفة من كائنات الأسئلة، كل كائن يحتوي على `text` و `category`.
                            </p>
                            <pre className="text-xs p-2 bg-muted rounded-md overflow-x-auto">
    {`{
      "questions": [
        { 
          "text": "ما هو أفضل كتاب قرأته؟", 
          "category": "اكتشف من انا" 
        }
      ]
    }`}
                            </pre>
                        </div>
                        <Button onClick={handleUpload} disabled={isUploading || !selectedFile} className="w-full">
                            <Upload className="mr-2 h-4 w-4" />
                            {isUploading ? 'جاري الرفع...' : 'رفع الملف'}
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>حذف الأسئلة</CardTitle>
                        <CardDescription>
                            حذف الأسئلة بناءً على القسم أو محتوى النص. هذه العملية لا يمكن التراجع عنها.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="category">
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="category">حسب القسم</TabsTrigger>
                            <TabsTrigger value="search">حسب النص</TabsTrigger>
                          </TabsList>
                          <TabsContent value="category" className="space-y-4 pt-4">
                            <Label htmlFor="category-delete">اسم القسم</Label>
                            <Input id="category-delete" value={deleteCategory} onChange={(e) => setDeleteCategory(e.target.value)} placeholder="مثال: اكتشف من انا" />
                            <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ category: deleteCategory })} disabled={!deleteCategory.trim() || isDeleting}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              {isDeleting ? 'جاري الحذف...' : 'حذف كل أسئلة القسم'}
                            </Button>
                          </TabsContent>
                          <TabsContent value="search" className="space-y-4 pt-4">
                            <Label htmlFor="search-delete">كلمة أو جملة للبحث</Label>
                            <Input id="search-delete" value={deleteSearchTerm} onChange={(e) => setDeleteSearchTerm(e.target.value)} placeholder="اكتب كلمة أو جملة هنا..." />
                            <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ searchTerm: deleteSearchTerm })} disabled={!deleteSearchTerm.trim() || isDeleting}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              {isDeleting ? 'جاري الحذف...' : 'حذف الأسئلة المطابقة'}
                            </Button>
                          </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>

                <Card className="border-destructive">
                    <CardHeader>
                        <CardTitle className="text-destructive">منطقة الخطر</CardTitle>
                        <CardDescription>
                            الإجراء في هذا القسم خطير للغاية ولا يمكن التراجع عنه.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="destructive"
                            className="w-full"
                            onClick={() => handleDeleteClick({ all: true })}
                            disabled={isDeleting}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {isDeleting ? 'جاري الحذف...' : 'حذف جميع الأسئلة من قاعدة البيانات'}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    {deletionParams?.all 
                      ? `تحذير شديد! هذا الإجراء سيحذف جميع الأسئلة (${deletionCount}) من قاعدة البيانات بشكل دائم. لا يمكن التراجع عن هذا الإجراء.`
                      : `هذا الإجراء لا يمكن التراجع عنه. سيتم حذف ${deletionCount} سؤال بشكل دائم بناءً على المعيار الذي حددته.`
                    }
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setIsDialogOpen(false)}>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmDelete} className={buttonVariants({ variant: "destructive" })}>
                    نعم، قم بالحذف
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}
