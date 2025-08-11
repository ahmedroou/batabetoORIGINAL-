
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
import { Upload, Trash2, Sparkles, Edit, Save } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  uploadTrapAnswerQuestionsFromJson,
  addTrapAnswerCategory,
  deleteTrapAnswerCategory,
  editTrapAnswerCategory,
  getTrapAnswerCategories,
  deleteQuestions,
  countQuestions,
  uploadWordWarWordsFromJson,
  deleteDuplicateWords,
  uploadPrisonQuestionsFromJson,
  deleteSimilarQuestions,
} from '@/lib/actions/admin';
import { Game } from '@/types';


type DeletionParams = {
    game: 'trap-answer' | 'word_war' | 'prison'; 
    category?: string; 
    all?: boolean; 
    duplicates?: 'word_war_duplicates' | { threshold: number };
    searchTerm?: string;
    answerSearchTerm?: string;
};


export default function QuestionManagementTab() {
    const { toast } = useToast();

    // States for Management
    const [selectedGame, setSelectedGame] = useState<Game['gameType'] | ''>('');
    const [selectedJsonFile, setSelectedJsonFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [deletionParams, setDeletionParams] = useState<DeletionParams | null>(null);
    const [deletionCount, setDeletionCount] = useState<number | null>(null);

    // States for Categories
    const [categories, setCategories] = useState<string[]>([]);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [editingCategory, setEditingCategory] = useState<{ oldName: string; newName: string } | null>(null);
    const [isEditingCat, setIsEditingCat] = useState(false);
    const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
    const [isDeletingCat, setIsDeletingCat] = useState(false);

     const [selectedCategory, setSelectedCategory] = useState('');


    useEffect(() => {
        const fetchCategories = async () => {
            const result = await getTrapAnswerCategories();
            if (result.success && result.categories) {
                setCategories(result.categories);
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

    const handleQuestionUpload = async () => {
        if (!selectedGame) {
            toast({ title: 'الرجاء اختيار لعبة أولاً', variant: 'destructive' });
            return;
        }
        if (!selectedJsonFile) {
            toast({ title: 'لم يتم تحديد ملف', description: 'الرجاء اختيار ملف JSON لرفعه.', variant: 'destructive' });
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

                switch(selectedGame) {
                    case 'trap-answer':
                         if (!selectedCategory) {
                            throw new Error('الرجاء اختيار قسم لرفع الأسئلة إليه.');
                        }
                        const trapQuestions: { question: string, answer: string, dummyAnswers: string[] }[] = Array.isArray(json) ? json : json.questions;
                        result = await uploadTrapAnswerQuestionsFromJson(trapQuestions, selectedCategory);
                        break;
                    case 'word_war': {
                        const words: string[] = Array.isArray(json) ? json : json.words;
                        result = await uploadWordWarWordsFromJson(words);
                        break;
                    }
                     case 'prison': {
                        const questions: { text: string }[] = Array.isArray(json) ? json : json.questions;
                        result = await uploadPrisonQuestionsFromJson(questions);
                        break;
                    }
                    default:
                        throw new Error("نوع لعبة غير مدعوم للرفع.");
                }

                if (result.success) {
                    toast({
                        title: 'نجاح',
                        description: `تم رفع ${result.count} عنصر بنجاح.`,
                    });
                    setSelectedJsonFile(null);
                    const fileInput = document.getElementById('json-upload-input') as HTMLInputElement;
                    if (fileInput) fileInput.value = '';
                } else {
                    throw new Error(result.error);
                }
            } catch (error: any) {
                toast({
                    title: 'خطأ في الرفع',
                    description: error.message || 'تأكد من أن الملف هو ملف JSON صالح ومتوافق مع اللعبة المختارة.',
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
        let isValid = params.all || params.category || params.duplicates || params.searchTerm || params.answerSearchTerm;
        if (!isValid) return;

        setDeletionParams(params);
        setIsDeleting(true);
        const countResult = await countQuestions(params as any);
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

        if (deletionParams.game === 'trap-answer' && typeof deletionParams.duplicates === 'object') {
            result = await deleteSimilarQuestions('trap-answer', deletionParams.duplicates.threshold, deletionParams.category);
        } else if (deletionParams.game === 'word_war' && deletionParams.duplicates === 'word_war_duplicates') {
            result = await deleteDuplicateWords();
        } else {
            result = await deleteQuestions(deletionParams as any);
        }
        setIsDeleting(false);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        } else if (result.success) {
            const message = `تم بنجاح حذف ${result.count} عنصر. ${result.message || ''}`;
            toast({ title: "نجاح", description: message });
        }
        setDeletionParams(null);
        setDeletionCount(null);
    };

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) {
            toast({ title: 'اسم القسم مطلوب', variant: 'destructive' });
            return;
        }
        setIsAddingCategory(true);
        const result = await addTrapAnswerCategory(newCategoryName);
        if (result.success) {
            toast({ title: 'تمت إضافة القسم بنجاح' });
            setCategories([...categories, newCategoryName.trim()]);
            setNewCategoryName('');
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsAddingCategory(false);
    };

    const handleEditCategory = async () => {
        if (!editingCategory || !editingCategory.newName.trim()) return;
        setIsEditingCat(true);
        const result = await editTrapAnswerCategory(editingCategory.oldName, editingCategory.newName);
        if (result.success) {
            toast({ title: 'تم تعديل القسم بنجاح' });
            setCategories(categories.map(c => (c === editingCategory.oldName ? editingCategory.newName : c)));
            setEditingCategory(null);
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsEditingCat(false);
    };

     const handleDeleteCategory = async () => {
        if (!deletingCategory) return;
        setIsDeletingCat(true);
        const result = await deleteTrapAnswerCategory(deletingCategory);
        if (result.success) {
            toast({ title: 'تم حذف القسم', description: `تم حذف ${result.count || 0} سؤال مرتبط به.` });
            setCategories(categories.filter(c => c !== deletingCategory));
            setDeletingCategory(null);
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsDeletingCat(false);
    };


    const renderUploadForm = () => (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="game-select-upload">1. اختر اللعبة</Label>
                <Select onValueChange={(v) => setSelectedGame(v as any)} value={selectedGame}>
                    <SelectTrigger id="game-select-upload">
                        <SelectValue placeholder="اختر لعبة لرفع محتوى لها..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="trap-answer">الجواب المفخخ / التاجر المتعلم</SelectItem>
                        <SelectItem value="word_war">حرب الكلمات</SelectItem>
                        <SelectItem value="prison">السجن</SelectItem>
                    </SelectContent>
                </Select>
                 {selectedGame === 'trap-answer' && <p className="text-xs text-muted-foreground pt-1">يستخدم "التاجر المتعلم" نفس أسئلة "الجواب المفخخ". ارفع الأسئلة هنا لكلا اللعبتين.</p>}
            </div>
            
             {selectedGame === 'trap-answer' && (
                <div className="space-y-2">
                    <Label htmlFor="category-select-upload">2. اختر القسم</Label>
                    <Select onValueChange={setSelectedCategory} value={selectedCategory}>
                        <SelectTrigger id="category-select-upload">
                            <SelectValue placeholder="اختر قسمًا..." />
                        </SelectTrigger>
                        <SelectContent>
                            {categories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            )}
            
            <div className="space-y-2">
                <Label htmlFor="json-upload-input">
                    {selectedGame === 'trap-answer' ? '3.' : '2.'} اختر ملف المحتوى (JSON)
                </Label>
                <Input id="json-upload-input" type="file" accept=".json" onChange={handleJsonFileChange} />
                <p className="text-xs text-muted-foreground">{getUploadHelperText()}</p>
            </div>
            
            <Button onClick={handleQuestionUpload} disabled={isUploading || !selectedJsonFile || !selectedGame} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? 'جاري الرفع...' : `رفع ملف "${selectedGame}"`}
            </Button>
        </div>
    );
    
    const getUploadHelperText = () => {
        switch(selectedGame) {
            case 'trap-answer': return "يجب أن يكون الملف مصفوفة من الأسئلة. كل سؤال يجب أن يكون كائنًا يحتوي على `question` و `answer`. حقل `dummyAnswers` اختياري للتاجر المتعلم.";
            case 'word_war': return "الملف يجب أن يكون مصفوفة من الكلمات (strings).";
            case 'prison': return "الملف يجب أن يكون مصفوفة من الأسئلة. كل سؤال يجب أن يكون كائنًا يحتوي على `text`.";
            default: return "اختر لعبة لرؤية تعليمات الرفع.";
        }
    }

    const renderDeleteForm = () => {
        if (!selectedGame) {
             return (
                 <div className="space-y-2">
                    <Label htmlFor="game-select-delete">1. اختر اللعبة</Label>
                    <Select onValueChange={(v) => setSelectedGame(v as any)} value={selectedGame}>
                        <SelectTrigger id="game-select-delete">
                            <SelectValue placeholder="اختر لعبة لحذف محتوى منها..." />
                        </SelectTrigger>
                        <SelectContent>
                             <SelectItem value="trap-answer">الجواب المفخخ</SelectItem>
                            <SelectItem value="word_war">حرب الكلمات</SelectItem>
                            <SelectItem value="prison">السجن</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
             );
         }
        
         if (selectedGame === 'trap-answer') {
             return renderTrapAnswerDelete();
         }
         if (selectedGame === 'word_war') {
             return renderWordWarDelete();
         }
         if (selectedGame === 'prison') {
             return renderPrisonDelete();
         }
         return null;
    };
    
    const renderTrapAnswerDelete = () => (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>حذف حسب القسم</Label>
                <Select onValueChange={(val) => val && handleDeleteClick({ game: 'trap-answer', category: val })} >
                     <SelectTrigger>
                        <SelectValue placeholder="اختر قسمًا لحذف جميع أسئلته..." />
                    </SelectTrigger>
                    <SelectContent>
                        {categories.map(cat => <SelectItem key={cat} value={cat}>حذف كل أسئلة "{cat}"</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
             <div className="space-y-2 border-t pt-4">
                 <h4 className="font-bold">حذف الأسئلة المكررة</h4>
                 <p className="text-sm text-muted-foreground">سيقوم هذا الإجراء بفحص الأسئلة المتشابهة وحذفها مع الإبقاء على أحدث نسخة.</p>
                  <Select onValueChange={(val) => val && handleDeleteClick({ game: 'trap-answer', category: val, duplicates: { threshold: 0.85 } })} >
                     <SelectTrigger>
                        <SelectValue placeholder="اختر قسمًا لفحص التكرارات فيه..." />
                    </SelectTrigger>
                    <SelectContent>
                        {categories.map(cat => <SelectItem key={cat} value={cat}>حذف المكرر من "{cat}"</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );

    const renderWordWarDelete = () => (
        <div className="space-y-4">
            <div className="space-y-2">
                 <h4 className="font-bold">حذف كل الكلمات</h4>
                 <p className="text-sm text-destructive text-center p-2 bg-destructive/10 rounded-md">تحذير! هذا الإجراء سيحذف جميع كلمات لعبة حرب الكلمات.</p>
                 <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'word_war', all: true })} disabled={isDeleting}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? 'جاري حذف الكل...' : 'تأكيد حذف جميع الكلمات'}
                </Button>
            </div>
            <div className="space-y-2 border-t pt-4">
                 <h4 className="font-bold">حذف الكلمات المكررة</h4>
                 <p className="text-sm text-muted-foreground">سيقوم هذا الإجراء بفحص جميع الكلمات وحذف أي نسخ متطابقة 100%.</p>
                 <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'word_war', duplicates: 'word_war_duplicates' })} disabled={isDeleting}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {isDeleting ? 'جاري الفحص والحذف...' : 'حذف الكلمات المكررة 100%'}
                </Button>
            </div>
        </div>
    );

    const renderPrisonDelete = () => (
         <div className="space-y-4">
             <div className="space-y-2">
                 <h4 className="font-bold">حذف كل أسئلة السجن</h4>
                 <p className="text-sm text-destructive text-center p-2 bg-destructive/10 rounded-md">تحذير! هذا الإجراء سيحذف جميع أسئلة لعبة السجن.</p>
                 <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'prison', all: true })} disabled={isDeleting}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? 'جاري حذف الكل...' : 'تأكيد حذف جميع الأسئلة'}
                </Button>
            </div>
         </div>
    );

    const getDialogDescription = () => {
        if (!deletionParams) return '';
        if (deletionParams.duplicates) {
            return `سيقوم هذا الإجراء بحذف جميع العناصر المكررة (${deletionCount}) من قاعدة البيانات، مع الإبقاء على نسخة واحدة فقط من كل عنصر. هل أنت متأكد؟`;
        }
        if (deletionParams.all) {
             return `تحذير شديد! هذا الإجراء سيحذف جميع العناصر (${deletionCount}) من قاعدة البيانات بشكل دائم للعبة المحددة. لا يمكن التراجع عن هذا الإجراء.`;
        }
        if (deletionParams.category) {
            return `سيقوم هذا الإجراء بحذف جميع الأسئلة (${deletionCount}) من قسم "${deletionParams.category}" بشكل دائم.`;
        }
        return `هذا الإجراء لا يمكن التراجع عنه. سيتم حذف ${deletionCount} عنصر بشكل دائم بناءً على المعيار الذي حددته.`
    };
    
    return (
        <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle>إدارة محتوى الألعاب</CardTitle>
                    <CardDescription>رفع وحذف الأسئلة والكلمات للألعاب المختلفة.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="upload" className="w-full" onValueChange={() => setSelectedGame('')}>
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="upload">رفع المحتوى</TabsTrigger>
                            <TabsTrigger value="delete">حذف المحتوى</TabsTrigger>
                        </TabsList>
                        <TabsContent value="upload" className="pt-4">{renderUploadForm()}</TabsContent>
                        <TabsContent value="delete" className="pt-4">{renderDeleteForm()}</TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle>إدارة الأقسام</CardTitle>
                    <CardDescription>إدارة أقسام لعبة "الجواب المفخخ" و "التاجر المتعلم".</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="space-y-2">
                        <Label>إضافة قسم جديد</Label>
                        <div className="flex gap-2">
                            <Input placeholder="اسم القسم الجديد" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} />
                            <Button onClick={handleAddCategory} disabled={isAddingCategory}>
                                {isAddingCategory ? '...' : 'إضافة'}
                            </Button>
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label>الأقسام الحالية</Label>
                        <ScrollArea className="h-64 border rounded-md p-2">
                            {categories.map(cat => (
                                <div key={cat} className="flex justify-between items-center p-1.5 bg-muted/50 rounded-md mb-2">
                                     {editingCategory?.oldName === cat ? (
                                        <Input
                                            value={editingCategory.newName}
                                            onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                                            className="h-8"
                                        />
                                    ) : (
                                        <span className="font-semibold">{cat}</span>
                                    )}
                                    <div className="flex gap-1">
                                        {editingCategory?.oldName === cat ? (
                                             <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleEditCategory} disabled={isEditingCat}>
                                                <Save className="w-4 h-4 text-green-500" />
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
        </div>

            <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                  <AlertDialogDescription>{getDialogDescription()}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => { setIsDialogOpen(false); }}>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmDelete} className={buttonVariants({ variant: "destructive" })} disabled={isDeleting}>
                    {isDeleting ? 'جاري العمل...' : 'نعم، قم بالتأكيد'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!deletingCategory} onOpenChange={() => setDeletingCategory(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف القسم "{deletingCategory}"؟</AlertDialogTitle>
                  <AlertDialogDescription>سيتم حذف هذا القسم وجميع الأسئلة المرتبطة به بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteCategory} disabled={isDeletingCat} className="bg-destructive hover:bg-destructive/90">
                    {isDeletingCat ? 'جاري الحذف...' : 'نعم، قم بالحذف'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

    