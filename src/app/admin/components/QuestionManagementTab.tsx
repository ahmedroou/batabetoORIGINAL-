
"use client";

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Trash2, Sparkles, PlusCircle, Edit, Save, X, Swords } from 'lucide-react';

import {
  uploadTrapAnswerQuestionsFromJson,
  deleteQuestions,
  countQuestions,
  deleteSimilarQuestions,
  getTrapAnswerCategories,
  addTrapAnswerCategory,
  editTrapAnswerCategory,
  deleteTrapAnswerCategory,
  uploadPrisonQuestionsFromJson,
  uploadWordWarWordsFromJson,
} from '@/lib/actions/admin';

export type DeletionParams = { 
    game: 'trap-answer' | 'prison' | 'word_war'; 
    category?: string; 
    searchTerm?: string; 
    answerSearchTerm?: string; 
    all?: boolean; 
    duplicates?: { threshold: number };
};


export default function QuestionManagementTab() {
    const { toast } = useToast();

    // States for Question Management
    const [isUploading, setIsUploading] = useState(false);
    const [selectedJsonFile, setSelectedJsonFile] = useState<File | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteSearchTerm, setDeleteSearchTerm] = useState('');
    const [deleteAnswerSearchTerm, setDeleteAnswerSearchTerm] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [deletionParams, setDeletionParams] = useState<DeletionParams | null>(null);
    const [deletionCount, setDeletionCount] = useState<number | null>(null);
    const [trapAnswerUploadCategory, setTrapAnswerUploadCategory] = useState<string>("");
    const [trapAnswerDeleteCategory, setTrapAnswerDeleteCategory] = useState<string>("");
    
    // State for Trap Answer Categories
    const [trapAnswerCategories, setTrapAnswerCategories] = useState<string[]>([]);
    const [newCategory, setNewCategory] = useState("");
    const [editingCategory, setEditingCategory] = useState<{ oldName: string, newName: string } | null>(null);
    const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);

    useEffect(() => {
        const fetchCategories = async () => {
            const categoriesResult = await getTrapAnswerCategories();
            if (categoriesResult.success && categoriesResult.categories) {
                setTrapAnswerCategories(categoriesResult.categories.sort((a,b) => a.localeCompare(b)));
            }
        };
        fetchCategories();
    }, []);

    const handleJsonFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const fileInput = event.target;
        if (fileInput.files) {
            setSelectedJsonFile(fileInput.files[0]);
        }
    };

    const handleQuestionUpload = async (gameType: 'trap-answer' | 'prison' | 'word_war') => {
        if (!selectedJsonFile) {
            toast({ title: 'لم يتم تحديد ملف', description: 'الرجاء اختيار ملف JSON لرفعه.', variant: 'destructive' });
            return;
        }
        if (gameType === 'trap-answer' && !trapAnswerUploadCategory) {
            toast({ title: 'لم يتم تحديد قسم', description: 'الرجاء اختيار قسم للعبة الجواب المفخخ.', variant: 'destructive' });
            return;
        }

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("Failed to read file.");
                const json = JSON.parse(text);
                let result;

                if (gameType === 'trap-answer') {
                     const questions: { question: string, answer: string, dummyAnswers: string[] }[] = Array.isArray(json) ? json : json.questions;
                     if (!Array.isArray(questions) || !questions.every(q => 
                        q && typeof q.question === 'string' && 
                        typeof q.answer === 'string' &&
                        Array.isArray(q.dummyAnswers) && q.dummyAnswers.length >= 2
                    )) {
                       throw new Error('كل سؤال في لعبة "الجواب المفخخ" يجب أن يكون كائنًا يحتوي على "question", "answer", و "dummyAnswers" (مصفوفة من جوابين نصيين على الأقل).');
                    }
                    result = await uploadTrapAnswerQuestionsFromJson(questions, trapAnswerUploadCategory);
                } else if (gameType === 'prison') {
                     const questions: { text: string }[] = Array.isArray(json) ? json : json.questions;
                     if (!Array.isArray(questions) || !questions.every(q => q && typeof q.text === 'string')) {
                         throw new Error('كل سؤال في لعبة "السجن" يجب أن يكون كائنًا يحتوي على مفتاح "text".');
                     }
                    result = await uploadPrisonQuestionsFromJson(questions);
                } else { // word_war game
                    const words: string[] = Array.isArray(json) ? json : json.words;
                     if (!Array.isArray(words) || !words.every(w => typeof w === 'string' && w.trim() !== '')) {
                         throw new Error('الملف يجب أن يكون مصفوفة من الكلمات (strings).');
                     }
                    result = await uploadWordWarWordsFromJson(words);
                }


                if (result.success) {
                    toast({
                        title: 'نجاح',
                        description: `تم رفع ${result.count} عنصر بنجاح.`,
                    });
                    setSelectedJsonFile(null);
                    const fileInput = document.getElementById(`json-upload-${gameType}`) as HTMLInputElement;
                    if (fileInput) fileInput.value = '';
                } else {
                    throw new Error(result.error);
                }
            } catch (error: any) {
                toast({
                    title: 'خطأ في الرفع',
                    description: error.message || 'تأكد من أن الملف هو ملف JSON صالح.',
                    variant: 'destructive',
                });
            } finally {
                setIsUploading(false);
            }
        };
        reader.onerror = () => {
             toast({ title: 'خطأ في قراءة الملف', variant: 'destructive' });
            setIsUploading(false);
        };
        reader.readAsText(selectedJsonFile);
    };

    const handleDeleteClick = async (params: DeletionParams) => {
        let isValid = params.all || params.duplicates || (params.category && params.category.trim()) || (params.searchTerm && params.searchTerm.trim()) || (params.answerSearchTerm && params.answerSearchTerm.trim());
        
        if (params.duplicates && !trapAnswerDeleteCategory) {
            toast({ title: "خطأ", description: "الرجاء اختيار قسم أولاً لحذف التكرارات منه.", variant: "destructive" });
            isValid = false;
        }
        
        if (!isValid) return;

        setDeletionParams(params);
        setIsDeleting(true);
        const countResult = await countQuestions(params);
        setIsDeleting(false);

        if (countResult.error) {
            toast({ title: "خطأ", description: countResult.error, variant: "destructive" });
            return;
        }

        if (countResult.count === 0) {
            toast({
                title: "لا يوجد ما يمكن حذفه",
                description: "لم يتم العثور على عناصر تطابق المعايير المحددة.",
            });
            return;
        }
        
        setDeletionCount(countResult.count);
        setIsDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!deletionParams) return;
        setIsDeleting(true);
        setIsDialogOpen(false);
        let result;
        if(deletionParams.duplicates && deletionParams.game === 'trap-answer') {
            result = await deleteSimilarQuestions(deletionParams.game, deletionParams.duplicates.threshold, deletionParams.category);
        } else {
            result = await deleteQuestions(deletionParams);
        }
        setIsDeleting(false);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        } else if (result.success) {
            const message = `تم بنجاح حذف ${result.count} عنصر. ${result.message || ''}`;
            toast({ title: "نجاح", description: message });
        }
        setDeleteSearchTerm('');
        setDeleteAnswerSearchTerm('');
        setTrapAnswerDeleteCategory('');
        setDeletionParams(null);
        setDeletionCount(null);
    };

     const handleAddCategory = async () => {
        if (!newCategory.trim()) {
            toast({ title: "اسم القسم لا يمكن أن يكون فارغًا", variant: "destructive" });
            return;
        }
        setIsActionLoading(true);
        const result = await addTrapAnswerCategory(newCategory.trim());
        if (result.success) {
            toast({ title: "تمت إضافة القسم بنجاح" });
            setTrapAnswerCategories(prev => [...prev, newCategory.trim()].sort((a,b) => a.localeCompare(b)));
            setNewCategory("");
        } else {
            toast({ title: "خطأ في الإضافة", description: result.error, variant: "destructive" });
        }
        setIsActionLoading(false);
    };

    const handleEditCategorySave = async () => {
        if (!editingCategory) return;
        setIsActionLoading(true);
        const result = await editTrapAnswerCategory(editingCategory.oldName, editingCategory.newName);
        if (result.success) {
            toast({ title: "تم تعديل القسم بنجاح" });
            setTrapAnswerCategories(prev => prev.map(c => c === editingCategory.oldName ? editingCategory.newName : c).sort((a,b) => a.localeCompare(b)));
            setEditingCategory(null);
        } else {
            toast({ title: "خطأ في التعديل", description: result.error, variant: "destructive" });
        }
        setIsActionLoading(false);
    }
    
    const handleConfirmCategoryDelete = async () => {
        if (!categoryToDelete) return;
        setIsActionLoading(true);
        const result = await deleteTrapAnswerCategory(categoryToDelete);
        if (result.success) {
            toast({ title: "تم حذف القسم بنجاح", description: `تم حذف ${result.count || 0} سؤال مرتبط به.` });
            setTrapAnswerCategories(prev => prev.filter(c => c !== categoryToDelete));
            setCategoryToDelete(null);
        } else {
            toast({ title: "خطأ في الحذف", description: result.error, variant: "destructive" });
        }
        setIsActionLoading(false);
        setIsDialogOpen(false);
    }
    
    const openDeleteCategoryDialog = (category: string) => {
        setCategoryToDelete(category);
        setDeletionParams(null); // Ensure question deletion params are cleared
        setIsDialogOpen(true);
    };

    const renderTrapAnswerQuestions = () => (
        <div className="space-y-4">
            <h3 className="font-bold text-lg">رفع أسئلة "الجواب المفخخ"</h3>
            <div className="space-y-2">
                <Label htmlFor="trap-category-select">اختر القسم</Label>
                <Select onValueChange={setTrapAnswerUploadCategory} value={trapAnswerUploadCategory}>
                    <SelectTrigger id="trap-category-select">
                        <SelectValue placeholder="اختر قسمًا لإضافة الأسئلة إليه..." />
                    </SelectTrigger>
                    <SelectContent>
                        {trapAnswerCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
             <div className="space-y-2">
                <Label htmlFor="json-upload-trap-answer">ملف الأسئلة (JSON)</Label>
                <Input id="json-upload-trap-answer" type="file" accept=".json" onChange={handleJsonFileChange} />
                <p className="text-xs text-muted-foreground">
                    الملف يجب أن يكون مصفوفة من الأسئلة. كل سؤال يجب أن يحتوي على `question` (نص)، `answer` (نص)، و `dummyAnswers` (مصفوفة من جوابين نصيين على الأقل).
                </p>
            </div>
            <Button onClick={() => handleQuestionUpload('trap-answer')} disabled={isUploading || !selectedJsonFile || !trapAnswerUploadCategory} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? 'جاري الرفع...' : 'رفع ملف "الجواب المفخخ"'}
            </Button>
        </div>
    );

    const renderPrisonQuestions = () => (
        <div className="space-y-4">
            <h3 className="font-bold text-lg">رفع أسئلة "السجن"</h3>
            <div className="space-y-2">
                <Label htmlFor="json-upload-prison">ملف الأسئلة (JSON)</Label>
                <Input id="json-upload-prison" type="file" accept=".json" onChange={handleJsonFileChange} />
                <p className="text-xs text-muted-foreground">
                    الملف يجب أن يكون مصفوفة من الأسئلة. كل سؤال يجب أن يحتوي على `text` (نص، مثل "أنواع فواكه").
                </p>
            </div>
            <Button onClick={() => handleQuestionUpload('prison')} disabled={isUploading || !selectedJsonFile} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? 'جاري الرفع...' : 'رفع ملف "السجن"'}
            </Button>
        </div>
    );

    const renderWordWarWords = () => (
        <div className="space-y-4">
            <h3 className="font-bold text-lg">رفع كلمات "حرب الكلمات"</h3>
            <div className="space-y-2">
                <Label htmlFor="json-upload-word_war">ملف الكلمات (JSON)</Label>
                <Input id="json-upload-word_war" type="file" accept=".json" onChange={handleJsonFileChange} />
                <p className="text-xs text-muted-foreground">
                    الملف يجب أن يكون مصفوفة من الكلمات (strings)، مثال: `["كلمة1", "كلمة2", "كلمة3"]`.
                </p>
            </div>
            <Button onClick={() => handleQuestionUpload('word_war')} disabled={isUploading || !selectedJsonFile} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? 'جاري الرفع...' : 'رفع ملف "حرب الكلمات"'}
            </Button>
        </div>
    );
    
    const renderManageCategories = () => (
        <div className="space-y-4">
             <div>
                <Label htmlFor="new-category-input">إضافة قسم جديد لـ "الجواب المفخخ"</Label>
                 <div className="flex gap-2 mt-1">
                    <Input id="new-category-input" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="اكتب اسم القسم هنا..."/>
                    <Button onClick={handleAddCategory} disabled={isActionLoading}>
                        <PlusCircle className="mr-2 h-4 w-4"/>
                        {isActionLoading ? '...' : 'إضافة'}
                    </Button>
                 </div>
             </div>
             <div className='border-t pt-4'>
                <h4 className="font-bold mb-2">الأقسام الحالية</h4>
                 <div className="space-y-2">
                    {trapAnswerCategories.map(cat => (
                        <div key={cat} className="flex items-center justify-between p-2 bg-muted rounded-md">
                            {editingCategory?.oldName === cat ? (
                                <Input 
                                    value={editingCategory.newName}
                                    onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                                    className="h-8"
                                />
                            ) : (
                                <span>{cat}</span>
                            )}
                            <div className="flex gap-1">
                                {editingCategory?.oldName === cat ? (
                                    <>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={handleEditCategorySave} disabled={isActionLoading}>
                                            <Save className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingCategory(null)} disabled={isActionLoading}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </>
                                ) : (
                                     <>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingCategory({ oldName: cat, newName: cat })} disabled={isActionLoading}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => openDeleteCategoryDialog(cat)} disabled={isActionLoading}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                 </div>
             </div>
        </div>
    );

    const renderTrapAnswerDelete = () => (
        <div>
            <Tabs defaultValue="category">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="category">حسب القسم</TabsTrigger>
                    <TabsTrigger value="searchQuestion">حسب نص السؤال</TabsTrigger>
                    <TabsTrigger value="searchAnswer">حسب نص الجواب</TabsTrigger>
                </TabsList>
                <TabsContent value="category" className="space-y-4 pt-4">
                    <Label htmlFor="category-delete-trap">اختر القسم للحذف منه</Label>
                    <Select onValueChange={setTrapAnswerDeleteCategory} value={trapAnswerDeleteCategory}>
                        <SelectTrigger id="category-delete-trap">
                            <SelectValue placeholder="اختر قسمًا..." />
                        </SelectTrigger>
                        <SelectContent>
                             {trapAnswerCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'trap-answer', category: trapAnswerDeleteCategory })} disabled={!trapAnswerDeleteCategory || isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? 'جاري الحذف...' : `حذف كل أسئلة قسم "${trapAnswerDeleteCategory}"`}
                    </Button>
                </TabsContent>
                <TabsContent value="searchQuestion" className="space-y-4 pt-4">
                    <Label htmlFor="search-delete-trap-q">كلمة أو جملة للبحث في السؤال</Label>
                    <Input id="search-delete-trap-q" value={deleteSearchTerm} onChange={(e) => setDeleteSearchTerm(e.target.value)} placeholder="اكتب كلمة أو جملة هنا..." />
                    <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'trap-answer', searchTerm: deleteSearchTerm })} disabled={!deleteSearchTerm.trim() || isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? 'جاري الحذف...' : 'حذف الأسئلة المطابقة'}
                    </Button>
                </TabsContent>
                <TabsContent value="searchAnswer" className="space-y-4 pt-4">
                    <Label htmlFor="search-delete-trap-a">كلمة أو جملة للبحث في الجواب الصحيح</Label>
                    <Input id="search-delete-trap-a" value={deleteAnswerSearchTerm} onChange={(e) => setDeleteAnswerSearchTerm(e.target.value)} placeholder="اكتب كلمة أو جملة هنا..." />
                    <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'trap-answer', answerSearchTerm: deleteAnswerSearchTerm })} disabled={!deleteAnswerSearchTerm.trim() || isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? 'جاري الحذف...' : 'حذف الأسئلة المطابقة'}
                    </Button>
                </TabsContent>
            </Tabs>
            <div className="mt-4 border-t pt-4 border-destructive/50">
                <h4 className="text-destructive font-bold mb-2">حذف الأسئلة المتشابهة</h4>
                <p className="text-xs text-muted-foreground mb-2">لحذف التكرارات، يجب عليك أولاً اختيار القسم من قائمة "حسب القسم" في الأعلى.</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                     <Button variant="destructive" onClick={() => handleDeleteClick({ game: 'trap-answer', all: true })} disabled={isDeleting} className="md:col-span-1">
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? '...' : 'حذف الكل'}
                    </Button>
                    <Button variant="destructive" onClick={() => handleDeleteClick({ game: 'trap-answer', duplicates: { threshold: 1.0 }, category: trapAnswerDeleteCategory })} disabled={isDeleting || !trapAnswerDeleteCategory}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {isDeleting ? '...' : 'حذف تشابه 100%'}
                    </Button>
                    <Button variant="destructive" onClick={() => handleDeleteClick({ game: 'trap-answer', duplicates: { threshold: 0.9 }, category: trapAnswerDeleteCategory })} disabled={isDeleting || !trapAnswerDeleteCategory}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {isDeleting ? '...' : 'حذف تشابه 90%'}
                    </Button>
                     <Button variant="destructive" onClick={() => handleDeleteClick({ game: 'trap-answer', duplicates: { threshold: 0.8 }, category: trapAnswerDeleteCategory })} disabled={isDeleting || !trapAnswerDeleteCategory}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {isDeleting ? '...' : 'حذف تشابه 80%'}
                    </Button>
                 </div>
            </div>
        </div>
    );

    const renderPrisonDelete = () => (
        <div>
            <Tabs defaultValue="search">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="search">حسب نص السؤال</TabsTrigger>
                    <TabsTrigger value="all">حذف الكل</TabsTrigger>
                </TabsList>
                <TabsContent value="search" className="space-y-4 pt-4">
                    <Label htmlFor="search-delete-prison">كلمة أو جملة للبحث في السؤال</Label>
                    <Input id="search-delete-prison" value={deleteSearchTerm} onChange={(e) => setDeleteSearchTerm(e.target.value)} placeholder="اكتب كلمة أو جملة هنا..." />
                    <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'prison', searchTerm: deleteSearchTerm })} disabled={!deleteSearchTerm.trim() || isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? 'جاري الحذف...' : 'حذف الأسئلة المطابقة'}
                    </Button>
                </TabsContent>
                 <TabsContent value="all" className="space-y-4 pt-4">
                     <p className="text-sm text-destructive text-center p-2 bg-destructive/10 rounded-md">تحذير! هذا الإجراء سيحذف جميع أسئلة لعبة السجن.</p>
                     <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'prison', all: true })} disabled={isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? 'جاري حذف الكل...' : 'تأكيد حذف جميع أسئلة السجن'}
                    </Button>
                </TabsContent>
            </Tabs>
        </div>
    );

     const renderWordWarDelete = () => (
        <div className="space-y-4">
             <p className="text-sm text-destructive text-center p-2 bg-destructive/10 rounded-md">تحذير! هذا الإجراء سيحذف جميع كلمات لعبة حرب الكلمات.</p>
             <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'word_war', all: true })} disabled={isDeleting}>
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? 'جاري حذف الكل...' : 'تأكيد حذف جميع الكلمات'}
            </Button>
        </div>
    );

    const getDialogDescription = () => {
        if (categoryToDelete) {
             return `هل أنت متأكد من حذف قسم "${categoryToDelete}"؟ سيتم حذف جميع الأسئلة المرتبطة به بشكل دائم. لا يمكن التراجع عن هذا الإجراء.`;
        }
        if (!deletionParams) return '';
        if (deletionParams.duplicates) {
            return `سيقوم هذا الإجراء بفحص جميع الأسئلة في قسم "${deletionParams.category}" وحذف الأسئلة المتشابهة بنسبة ${deletionParams.duplicates.threshold * 100}% أو أكثر، مع الإبقاء على النسخة الأحدث. سيتم حذف ${deletionCount} سؤال. هل أنت متأكد؟`;
        }
        if (deletionParams.all) {
             return `تحذير شديد! هذا الإجراء سيحذف جميع العناصر (${deletionCount}) من قاعدة البيانات بشكل دائم للعبة المحددة. لا يمكن التراجع عن هذا الإجراء.`;
        }
        return `هذا الإجراء لا يمكن التراجع عنه. سيتم حذف ${deletionCount} عنصر بشكل دائم بناءً على المعيار الذي حددته.`
    };
    
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>إدارة محتوى الألعاب</CardTitle>
                    <CardDescription>رفع وحذف الأسئلة والكلمات للألعاب المختلفة.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="upload-trap" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
                            <TabsTrigger value="upload-trap">رفع (مفخخ)</TabsTrigger>
                            <TabsTrigger value="upload-prison">رفع (سجن)</TabsTrigger>
                            <TabsTrigger value="upload-wordwar">رفع (كلمات)</TabsTrigger>
                            <TabsTrigger value="delete-trap">حذف (مفخخ)</TabsTrigger>
                            <TabsTrigger value="delete-prison">حذف (سجن)</TabsTrigger>
                            <TabsTrigger value="delete-wordwar">حذف (كلمات)</TabsTrigger>
                            {/* <TabsTrigger value="manage-categories">إدارة الأقسام</TabsTrigger> */}
                        </TabsList>
                        <TabsContent value="upload-trap" className="pt-4">{renderTrapAnswerQuestions()}</TabsContent>
                        <TabsContent value="upload-prison" className="pt-4">{renderPrisonQuestions()}</TabsContent>
                        <TabsContent value="upload-wordwar" className="pt-4">{renderWordWarWords()}</TabsContent>
                        <TabsContent value="delete-trap" className="pt-4">{renderTrapAnswerDelete()}</TabsContent>
                        <TabsContent value="delete-prison" className="pt-4">{renderPrisonDelete()}</TabsContent>
                         <TabsContent value="delete-wordwar" className="pt-4">{renderWordWarDelete()}</TabsContent>
                        {/* <TabsContent value="manage-categories" className="pt-4">{renderManageCategories()}</TabsContent> */}
                    </Tabs>
                </CardContent>
            </Card>

            <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                  <AlertDialogDescription>{getDialogDescription()}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => { setIsDialogOpen(false); setCategoryToDelete(null); }}>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={categoryToDelete ? handleConfirmCategoryDelete : confirmDelete} className={buttonVariants({ variant: "destructive" })} disabled={isDeleting || isActionLoading}>
                    {(isDeleting || isActionLoading) ? 'جاري العمل...' : 'نعم، قم بالتأكيد'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

