

"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Trash2, Sparkles, PlusCircle, Edit, Save, X, Swords, Dices } from 'lucide-react';

import {
  uploadTrapAnswerQuestionsFromJson,
  deleteQuestions,
  countQuestions,
  deleteSimilarQuestions,
  getTrapAnswerCategories,
  addTrapAnswerCategory,
  editTrapAnswerCategory,
  deleteTrapAnswerCategory,
  uploadWordWarWordsFromJson,
  deleteDuplicateWords,
  uploadPrisonQuestionsFromJson,
  uploadBankOfLuckQuestionsFromJson,
} from '@/lib/actions/admin';
import { Game } from '@/types';
import { getDrawAndGuessCategories, addDrawAndGuessCategory, editDrawAndGuessCategory, deleteDrawAndGuessCategory, uploadDrawAndGuessPromptsFromJson } from '@/lib/actions/draw-and-guess-admin';

export type DeletionParams = { 
    game: 'trap-answer' | 'word_war' | 'draw-and-guess' | 'prison' | 'bank_of_luck'; 
    category?: string; 
    all?: boolean; 
    duplicates?: { threshold: number } | 'word_war_duplicates';
};


export default function QuestionManagementTab() {
    const { toast } = useToast();
    const { userProfile } = useAuth();

    // States for Management
    const [selectedGame, setSelectedGame] = useState<Game['gameType'] | ''>('');
    const [selectedJsonFile, setSelectedJsonFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [deletionParams, setDeletionParams] = useState<DeletionParams | null>(null);
    const [deletionCount, setDeletionCount] = useState<number | null>(null);
    
    // Trap Answer States
    const [trapAnswerUploadCategory, setTrapAnswerUploadCategory] = useState<string>("");
    const [trapAnswerDeleteCategory, setTrapAnswerDeleteCategory] = useState<string>("");
    const [trapAnswerCategories, setTrapAnswerCategories] = useState<string[]>([]);
    
    // Draw and Guess States
    const [drawAndGuessUploadCategory, setDrawAndGuessUploadCategory] = useState<string>("");
    const [drawAndGuessCategories, setDrawAndGuessCategories] = useState<string[]>([]);
    
    // Bank of Luck States
    const [bankOfLuckUploadCategory, setBankOfLuckUploadCategory] = useState<string>("");
    const [bankOfLuckCategories, setBankOfLuckCategories] = useState<string[]>(['جغرافيا', 'رياضة', 'علوم', 'أنمي', 'تاريخ', 'أدب']); // Placeholder

    // Shared Category Management States
    const [newCategory, setNewCategory] = useState("");
    const [editingCategory, setEditingCategory] = useState<{ oldName: string, newName: string } | null>(null);
    const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [categoryManagementGame, setCategoryManagementGame] = useState<'trap-answer' | 'draw-and-guess' | ''>('');

    const fetchCategories = async (gameType: 'trap-answer' | 'draw-and-guess') => {
        if (!userProfile?.uid) return;
        let categoriesResult;
        if (gameType === 'trap-answer') {
            categoriesResult = await getTrapAnswerCategories(userProfile.uid);
            if (categoriesResult.success && categoriesResult.categories) {
                setTrapAnswerCategories(categoriesResult.categories.sort((a,b) => a.localeCompare(b)));
            }
        } else if (gameType === 'draw-and-guess') {
            categoriesResult = await getDrawAndGuessCategories(userProfile.uid);
             if (categoriesResult.success && categoriesResult.categories) {
                setDrawAndGuessCategories(categoriesResult.categories.sort((a,b) => a.localeCompare(b)));
            }
        }
    };
    
    useEffect(() => {
        if (userProfile?.uid) {
            fetchCategories('trap-answer');
            fetchCategories('draw-and-guess');
        }
    }, [userProfile?.uid]);

    const handleJsonFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const fileInput = event.target;
        if (fileInput.files) {
            setSelectedJsonFile(fileInput.files[0]);
        }
    };

    const handleQuestionUpload = async () => {
        if (!userProfile?.uid) return;
        if (!selectedGame) {
            toast({ title: 'الرجاء اختيار لعبة أولاً', variant: 'destructive' });
            return;
        }
        if (!selectedJsonFile) {
            toast({ title: 'لم يتم تحديد ملف', description: 'الرجاء اختيار ملف JSON لرفعه.', variant: 'destructive' });
            return;
        }
        
        let uploadCategory = '';
        if (selectedGame === 'trap-answer') uploadCategory = trapAnswerUploadCategory;
        if (selectedGame === 'draw-and-guess') uploadCategory = drawAndGuessUploadCategory;
        if (selectedGame === 'bank_of_luck') uploadCategory = bankOfLuckUploadCategory;

        if ((selectedGame === 'trap-answer' || selectedGame === 'draw-and-guess' || selectedGame === 'bank_of_luck') && !uploadCategory) {
            toast({ title: 'لم يتم تحديد قسم', description: 'الرجاء اختيار قسم للعبة المختارة.', variant: 'destructive' });
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
                    case 'trap-answer': {
                        const questions: { question: string, answer: string, dummyAnswers: string[] }[] = Array.isArray(json) ? json : json.questions;
                        result = await uploadTrapAnswerQuestionsFromJson(userProfile.uid, questions, uploadCategory);
                        break;
                    }
                    case 'word_war': {
                        const words: string[] = Array.isArray(json) ? json : json.words;
                        result = await uploadWordWarWordsFromJson(userProfile.uid, words);
                        break;
                    }
                    case 'draw-and-guess': {
                        const prompts: { text: string }[] = Array.isArray(json) ? json : json.prompts;
                        result = await uploadDrawAndGuessPromptsFromJson(userProfile.uid, prompts, uploadCategory);
                        break;
                    }
                     case 'prison': {
                        const questions: { text: string }[] = Array.isArray(json) ? json : json.questions;
                        result = await uploadPrisonQuestionsFromJson(userProfile.uid, questions);
                        break;
                    }
                     case 'bank_of_luck': {
                        const questions: { text: string, options: string[], correctAnswer: string }[] = Array.isArray(json) ? json : json.questions;
                        result = await uploadBankOfLuckQuestionsFromJson(userProfile.uid, questions, uploadCategory);
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
        if (!userProfile?.uid) return;
        let isValid = params.all || params.duplicates || (params.category && params.category.trim());
        
        if (params.game === 'trap-answer' && params.duplicates && typeof params.duplicates === 'object' && !trapAnswerDeleteCategory) {
            toast({ title: "خطأ", description: "الرجاء اختيار قسم أولاً لحذف التكرارات منه.", variant: "destructive" });
            isValid = false;
        }
        
        if (!isValid) return;

        setDeletionParams(params);
        setIsDeleting(true);
        const countResult = await countQuestions(userProfile.uid, params as any);
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
        if (!deletionParams || !userProfile?.uid) return;
        setIsDeleting(true);
        setIsDialogOpen(false);
        let result;

        if (deletionParams.game === 'word_war' && deletionParams.duplicates === 'word_war_duplicates') {
            result = await deleteDuplicateWords(userProfile.uid);
        } else if(deletionParams.duplicates && typeof deletionParams.duplicates === 'object' && deletionParams.game === 'trap-answer') {
            result = await deleteSimilarQuestions(userProfile.uid, deletionParams.game, deletionParams.duplicates.threshold, deletionParams.category);
        } else {
            result = await deleteQuestions(userProfile.uid, deletionParams as any);
        }
        setIsDeleting(false);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        } else if (result.success) {
            const message = `تم بنجاح حذف ${result.count} عنصر. ${result.message || ''}`;
            toast({ title: "نجاح", description: message });
        }
        setTrapAnswerDeleteCategory('');
        setDeletionParams(null);
        setDeletionCount(null);
    };

     const handleAddCategory = async () => {
        if (!newCategory.trim() || !categoryManagementGame || !userProfile?.uid) {
            toast({ title: "الرجاء اختيار لعبة وكتابة اسم القسم", variant: "destructive" });
            return;
        }
        setIsActionLoading(true);
        const result = categoryManagementGame === 'trap-answer' 
            ? await addTrapAnswerCategory(userProfile.uid, newCategory.trim())
            : await addDrawAndGuessCategory(userProfile.uid, newCategory.trim());

        if (result.success) {
            toast({ title: "تمت إضافة القسم بنجاح" });
            fetchCategories(categoryManagementGame);
            setNewCategory("");
        } else {
            toast({ title: "خطأ في الإضافة", description: result.error, variant: "destructive" });
        }
        setIsActionLoading(false);
    };

    const handleEditCategorySave = async () => {
        if (!editingCategory || !categoryManagementGame || !userProfile?.uid) return;
        setIsActionLoading(true);
        const result = categoryManagementGame === 'trap-answer'
            ? await editTrapAnswerCategory(userProfile.uid, editingCategory.oldName, editingCategory.newName)
            : await editDrawAndGuessCategory(userProfile.uid, editingCategory.oldName, editingCategory.newName);

        if (result.success) {
            toast({ title: "تم تعديل القسم بنجاح" });
            fetchCategories(categoryManagementGame);
            setEditingCategory(null);
        } else {
            toast({ title: "خطأ في التعديل", description: result.error, variant: "destructive" });
        }
        setIsActionLoading(false);
    }
    
    const handleConfirmCategoryDelete = async () => {
        if (!categoryToDelete || !categoryManagementGame || !userProfile?.uid) return;
        setIsActionLoading(true);
        const result = categoryManagementGame === 'trap-answer'
            ? await deleteTrapAnswerCategory(userProfile.uid, categoryToDelete)
            : await deleteDrawAndGuessCategory(userProfile.uid, categoryToDelete);
        
        if (result.success) {
            toast({ title: "تم حذف القسم بنجاح", description: `تم حذف ${result.count || 0} عنصر مرتبط به.` });
            fetchCategories(categoryManagementGame);
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
    
    const renderUploadForm = () => (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="game-select-upload">1. اختر اللعبة</Label>
                <Select onValueChange={(v) => setSelectedGame(v as any)} value={selectedGame}>
                    <SelectTrigger id="game-select-upload">
                        <SelectValue placeholder="اختر لعبة لرفع محتوى لها..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="trap-answer">الجواب المفخخ</SelectItem>
                        <SelectItem value="word_war">حرب الكلمات</SelectItem>
                        <SelectItem value="draw-and-guess">لعبة رسمة</SelectItem>
                        <SelectItem value="prison">السجن</SelectItem>
                        <SelectItem value="bank_of_luck">بنك الحظ</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {selectedGame === 'trap-answer' && (
                <div className="space-y-2">
                    <Label htmlFor="trap-category-select">2. اختر قسم "الجواب المفخخ"</Label>
                    <Select onValueChange={setTrapAnswerUploadCategory} value={trapAnswerUploadCategory}>
                        <SelectTrigger id="trap-category-select">
                            <SelectValue placeholder="اختر قسمًا لإضافة الأسئلة إليه..." />
                        </SelectTrigger>
                        <SelectContent>
                            {trapAnswerCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            )}
            
            {selectedGame === 'draw-and-guess' && (
                <div className="space-y-2">
                    <Label htmlFor="draw-category-select">2. اختر قسم "لعبة رسمة"</Label>
                    <Select onValueChange={setDrawAndGuessUploadCategory} value={drawAndGuessUploadCategory}>
                        <SelectTrigger id="draw-category-select">
                            <SelectValue placeholder="اختر قسمًا لإضافة الكلمات إليه..." />
                        </SelectTrigger>
                        <SelectContent>
                            {drawAndGuessCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {selectedGame === 'bank_of_luck' && (
                 <div className="space-y-2">
                    <Label htmlFor="snakes-category-select">2. اختر قسم "بنك الحظ"</Label>
                     <Select onValueChange={setBankOfLuckUploadCategory} value={bankOfLuckUploadCategory}>
                        <SelectTrigger id="snakes-category-select">
                            <SelectValue placeholder="اختر قسمًا لإضافة الأسئلة إليه..." />
                        </SelectTrigger>
                        <SelectContent>
                            {bankOfLuckCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            )}

            <div className="space-y-2">
                <Label htmlFor="json-upload-input">
                    {(selectedGame === 'trap-answer' || selectedGame === 'draw-and-guess' || selectedGame === 'bank_of_luck') ? '3. ' : '2. '}
                    اختر ملف المحتوى (JSON)
                </Label>
                <Input id="json-upload-input" type="file" accept=".json" onChange={handleJsonFileChange} />
                <p className="text-xs text-muted-foreground">{getUploadHelperText()}</p>
            </div>
            
            <Button onClick={handleQuestionUpload} disabled={isUploading || !selectedJsonFile || !selectedGame || ((selectedGame === 'trap-answer' || selectedGame === 'draw-and-guess' || selectedGame === 'bank_of_luck') && (!trapAnswerUploadCategory && !drawAndGuessUploadCategory && !bankOfLuckUploadCategory))} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? 'جاري الرفع...' : `رفع ملف "${selectedGame}"`}
            </Button>
        </div>
    );
    
    const getUploadHelperText = () => {
        switch(selectedGame) {
            case 'trap-answer': return "الملف يجب أن يكون مصفوفة من الأسئلة. كل سؤال يجب أن يحتوي على `question`, `answer`, و `dummyAnswers`.";
            case 'word_war': return "الملف يجب أن يكون مصفوفة من الكلمات (strings).";
            case 'draw-and-guess': return "الملف يجب أن يكون مصفوفة من الكلمات. كل كلمة يجب أن تكون كائنًا يحتوي على `text`.";
            case 'prison': return "الملف يجب أن يكون مصفوفة من الأسئلة. كل سؤال يجب أن يكون كائنًا يحتوي على `text`.";
            case 'bank_of_luck': return "الملف يجب أن يكون مصفوفة من الأسئلة. كل سؤال: `text`, `options` (4 strings), `correctAnswer` (one of the options).";
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
                             <SelectItem value="bank_of_luck">بنك الحظ</SelectItem>
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
         if (selectedGame === 'bank_of_luck') {
             return renderBankOfLuckDelete();
         }
         return null;
    };
    
    const renderManageCategories = () => (
        <div className="space-y-4">
             <div className="space-y-2">
                <Label htmlFor="category-game-select">1. اختر اللعبة لإدارة أقسامها</Label>
                <Select onValueChange={(v) => setCategoryManagementGame(v as any)} value={categoryManagementGame}>
                    <SelectTrigger id="category-game-select">
                        <SelectValue placeholder="اختر لعبة..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="trap-answer">الجواب المفخخ</SelectItem>
                        <SelectItem value="draw-and-guess">لعبة رسمة</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {categoryManagementGame && (
            <>
                 <div>
                    <Label htmlFor="new-category-input">إضافة قسم جديد لـ "{categoryManagementGame === 'trap-answer' ? 'الجواب المفخخ' : 'لعبة رسمة'}"</Label>
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
                        {(categoryManagementGame === 'trap-answer' ? trapAnswerCategories : drawAndGuessCategories).map(cat => (
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
             </>
             )}
        </div>
    );

    const renderTrapAnswerDelete = () => (
        <div>
            <Tabs defaultValue="category">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="category">حسب القسم</TabsTrigger>
                    <TabsTrigger value="advanced">خيارات متقدمة</TabsTrigger>
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
                <TabsContent value="advanced" className="space-y-4 pt-4">
                     <h4 className="text-destructive font-bold mb-2">حذف الأسئلة المتشابهة</h4>
                    <p className="text-xs text-muted-foreground mb-2">لحذف التكرارات، يجب عليك أولاً اختيار القسم من قائمة "حسب القسم" في الأعلى.</p>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                     <div className="mt-4 border-t pt-4 border-destructive/50">
                          <Button variant="destructive" onClick={() => handleDeleteClick({ game: 'trap-answer', all: true })} disabled={isDeleting} className="w-full">
                            <Trash2 className="mr-2 h-4 w-4" />
                            {isDeleting ? '...' : 'حذف كل أسئلة الجواب المفخخ'}
                        </Button>
                     </div>
                </TabsContent>
            </Tabs>
        </div>
    );
    
    const renderBankOfLuckDelete = () => (
        <div className="space-y-4">
            <h4 className="font-bold">حذف كل أسئلة بنك الحظ</h4>
            <p className="text-sm text-destructive text-center p-2 bg-destructive/10 rounded-md">تحذير! هذا الإجراء سيحذف جميع أسئلة لعبة بنك الحظ.</p>
            <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'bank_of_luck', all: true })} disabled={isDeleting}>
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? 'جاري حذف الكل...' : 'تأكيد حذف جميع الأسئلة'}
            </Button>
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
        if (categoryToDelete) {
             return `هل أنت متأكد من حذف قسم "${categoryToDelete}"؟ سيتم حذف جميع الأسئلة المرتبطة به بشكل دائم. لا يمكن التراجع عن هذا الإجراء.`;
        }
        if (!deletionParams) return '';
        if (deletionParams.duplicates === 'word_war_duplicates') {
            return `سيقوم هذا الإجراء بحذف جميع الكلمات المكررة تمامًا من قاعدة البيانات، مع الإبقاء على نسخة واحدة فقط من كل كلمة. سيتم حذف ${deletionCount} كلمة. هل أنت متأكد؟`;
        }
        if (deletionParams.duplicates && typeof deletionParams.duplicates === 'object') {
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
                    <Tabs defaultValue="upload" className="w-full" onValueChange={() => setSelectedGame('')}>
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="upload">رفع المحتوى</TabsTrigger>
                            <TabsTrigger value="delete">حذف المحتوى</TabsTrigger>
                            <TabsTrigger value="manage-categories">إدارة الأقسام</TabsTrigger>
                        </TabsList>
                        <TabsContent value="upload" className="pt-4">{renderUploadForm()}</TabsContent>
                        <TabsContent value="delete" className="pt-4">{renderDeleteForm()}</TabsContent>
                        <TabsContent value="manage-categories" className="pt-4">{renderManageCategories()}</TabsContent>
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
