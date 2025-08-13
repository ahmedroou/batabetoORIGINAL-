

"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Trash2, Sparkles, Edit, Save, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  uploadEducatedMerchantQuestionsFromJson,
  deleteSimilarPrisonQuestions,
} from '@/lib/actions/admin';
import type { Game } from '@/types';


type DeletionParams = {
    game: 'trap-answer' | 'word_war' | 'prison' | 'educated-merchant'; 
    category?: string; 
    all?: boolean; 
    duplicates?: boolean;
    searchTerm?: string;
    answerSearchTerm?: string;
};


const CategoryManager = ({ 
    gameType, 
    categories, 
    setCategories,
    onAdd,
    onEdit,
    onDelete,
 }: { 
    gameType: 'trap-answer' | 'educated-merchant',
    categories: string[],
    setCategories: React.Dispatch<React.SetStateAction<string[]>>,
    onAdd: (name: string) => Promise<any>,
    onEdit: (oldName: string, newName: string) => Promise<any>,
    onDelete: (name: string) => Promise<any>,
}) => {
    const { toast } = useToast();
    const [newCategoryName, setNewCategoryName] = useState('');
    const [editingCategory, setEditingCategory] = useState<{ oldName: string; newName: string } | null>(null);
    const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

     const handleAddCategory = async () => {
        if (!newCategoryName.trim()) {
            toast({ title: 'اسم القسم مطلوب', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        const result = await onAdd(newCategoryName);
        if (result.success) {
            toast({ title: 'تمت إضافة القسم بنجاح' });
            setCategories([...categories, newCategoryName.trim()]);
            setNewCategoryName('');
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };

    const handleEditCategory = async () => {
        if (!editingCategory || !editingCategory.newName.trim()) return;
        setIsSubmitting(true);
        const result = await onEdit(editingCategory.oldName, editingCategory.newName);
        if (result.success) {
            toast({ title: 'تم تعديل القسم بنجاح' });
            setCategories(categories.map(c => (c === editingCategory.oldName ? editingCategory.newName.trim() : c)));
            setEditingCategory(null);
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };

     const handleDeleteCategory = async () => {
        if (!deletingCategory) return;
        setIsSubmitting(true);
        const result = await onDelete(deletingCategory);
        if (result.success) {
            toast({ title: 'تم حذف القسم', description: `تم حذف ${result.count || 0} سؤال مرتبط به.` });
            setCategories(categories.filter(c => c !== deletingCategory));
            setDeletingCategory(null);
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>إدارة أقسام {gameType === 'trap-answer' ? "الجواب المفخخ" : "التاجر المتعلم"}</CardTitle>
                    <CardDescription>إضافة وتعديل وحذف الأقسام لهذه اللعبة.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="space-y-2">
                        <Label>إضافة قسم جديد</Label>
                        <div className="flex gap-2">
                            <Input placeholder="اسم القسم الجديد" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} />
                            <Button onClick={handleAddCategory} disabled={isSubmitting}>
                                {isSubmitting ? '...' : 'إضافة'}
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
                                            disabled={isSubmitting}
                                        />
                                    ) : (
                                        <span className="font-semibold">{cat}</span>
                                    )}
                                    <div className="flex gap-1">
                                        {editingCategory?.oldName === cat ? (
                                             <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleEditCategory} disabled={isSubmitting}>
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
            <AlertDialog open={!!deletingCategory} onOpenChange={() => setDeletingCategory(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف القسم "{deletingCategory}"؟</AlertDialogTitle>
                  <AlertDialogDescription>سيتم حذف هذا القسم وجميع الأسئلة المرتبطة به بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteCategory} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                    {isSubmitting ? 'جاري الحذف...' : 'نعم، قم بالحذف'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </>
    )
}


export default function QuestionManagementTab() {
    const { toast } = useToast();

    const [selectedGame, setSelectedGame] = useState<'trap-answer' | 'educated-merchant' | 'word_war' | 'prison' | ''>('');
    const [selectedJsonFile, setSelectedJsonFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [deletionParams, setDeletionParams] = useState<DeletionParams | null>(null);
    const [deletionCount, setDeletionCount] = useState<number | null>(null);

    const [trapAnswerCategories, setTrapAnswerCategories] = useState<string[]>([]);
    const [merchantCategories, setMerchantCategories] = useState<string[]>([]);
    
    const [selectedCategory, setSelectedCategory] = useState('');
    
    const [activeCategoryManager, setActiveCategoryManager] = useState<'trap-answer' | 'educated-merchant' | null>(null);
    
    // State for delete forms
    const [deleteCategory, setDeleteCategory] = useState('');
    const [deleteSearchTerm, setDeleteSearchTerm] = useState('');
    const [deleteAnswerSearchTerm, setDeleteAnswerSearchTerm] = useState('');
    const [deleteSimilarityCategory, setDeleteSimilarityCategory] = useState('');


    const currentCategoryList = useMemo(() => {
        if(selectedGame === 'trap-answer' || selectedGame === 'educated-merchant') {
            return selectedGame === 'trap-answer' ? trapAnswerCategories : merchantCategories;
        }
        return [];
    }, [selectedGame, trapAnswerCategories, merchantCategories]);


    useEffect(() => {
        const fetchCategories = async () => {
            const [trapRes, merchantRes] = await Promise.all([
                getTrapAnswerCategories(),
                getEducatedMerchantCategories(),
            ]);
            if (trapRes.success && trapRes.categories) {
                setTrapAnswerCategories(trapRes.categories);
            }
             if (merchantRes.success && merchantRes.categories) {
                setMerchantCategories(merchantRes.categories);
            }
        };
        fetchCategories();
    }, []);
    
    const handleGameSelection = (game: 'trap-answer' | 'educated-merchant' | 'word_war' | 'prison' | '') => {
        setSelectedGame(game);
        setSelectedCategory('');
        setDeleteCategory('');
        setDeleteSearchTerm('');
        setDeleteAnswerSearchTerm('');
        setDeleteSimilarityCategory('');
        if(game === 'trap-answer' || game === 'educated-merchant') {
            setActiveCategoryManager(game);
        } else {
             setActiveCategoryManager(null);
        }
    }

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
                const questions: { question: string, answer: string, dummyAnswers?: string[] }[] = Array.isArray(json) ? json : json.questions;

                switch(selectedGame) {
                    case 'trap-answer':
                         if (!selectedCategory) {
                            throw new Error('الرجاء اختيار قسم لرفع الأسئلة إليه.');
                        }
                        result = await uploadTrapAnswerQuestionsFromJson(questions, selectedCategory);
                        break;
                    case 'educated-merchant':
                         if (!selectedCategory) {
                            throw new Error('الرجاء اختيار قسم لرفع الأسئلة إليه.');
                        }
                        result = await uploadEducatedMerchantQuestionsFromJson(questions, selectedCategory);
                        break;
                    case 'word_war': {
                        const words: string[] = Array.isArray(json) ? json : json.words;
                        result = await uploadWordWarWordsFromJson(words);
                        break;
                    }
                     case 'prison': {
                        const prisonQuestions: { text: string }[] = Array.isArray(json) ? json : json.questions;
                        result = await uploadPrisonQuestionsFromJson(prisonQuestions);
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
        let isValid = params.all || params.category || params.searchTerm || params.answerSearchTerm || params.duplicates;
        if (!isValid) return;

        setDeletionParams(params);
        setIsDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!deletionParams) return;
        setIsDeleting(true);
        setIsDialogOpen(false);
        let result: { success?: boolean; count?: number; error?: string; message?: string } | undefined;

        if (deletionParams.duplicates) {
            if (deletionParams.game === 'trap-answer' || deletionParams.game === 'educated-merchant') {
                result = await deleteSimilarQuestions(deletionParams.game, deletionParams.category);
            } else if (deletionParams.game === 'prison') {
                 result = await deleteSimilarPrisonQuestions();
            }
        } else {
            result = await deleteQuestions(deletionParams as any);
        }
        
        setIsDeleting(false);
        if (result && result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        } else if (result && result.success) {
            const message = `تم بنجاح حذف ${result.count} عنصر. ${result.message || ''}`;
            toast({ title: "نجاح", description: message });
        } else {
             toast({ title: "خطأ", description: "حدث خطأ غير متوقع أثناء الحذف.", variant: "destructive" });
        }
        setDeletionParams(null);
    };

    const renderUploadForm = () => (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="game-select-upload">1. اختر اللعبة</Label>
                <Select onValueChange={(v) => handleGameSelection(v as any)} value={selectedGame}>
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
            
             {(selectedGame === 'trap-answer' || selectedGame === 'educated-merchant') && (
                <div className="space-y-2">
                    <Label htmlFor="category-select-upload">2. اختر القسم</Label>
                    <div className="flex items-center gap-2">
                         <div className="flex-grow">
                             <Select onValueChange={setSelectedCategory} value={selectedCategory}>
                                <SelectTrigger id="category-select-upload">
                                    <SelectValue placeholder={`اختر من أقسام ${selectedGame === 'trap-answer' ? 'الجواب المفخخ' : 'التاجر المتعلم'}`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {currentCategoryList.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                                </SelectContent>
                            </Select>
                         </div>
                    </div>
                </div>
            )}
            
            <div className="space-y-2">
                <Label htmlFor="json-upload-input">
                    {(selectedGame === 'trap-answer' || selectedGame === 'educated-merchant') ? '3.' : '2.'} اختر ملف المحتوى (JSON)
                </Label>
                <Input id="json-upload-input" type="file" accept=".json" onChange={handleJsonFileChange} />
                <p className="text-xs text-muted-foreground">{getUploadHelperText()}</p>
            </div>
            
            <Button onClick={handleQuestionUpload} disabled={isUploading || !selectedJsonFile || !selectedGame} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? 'جاري الرفع...' : `رفع ملف`}
            </Button>
        </div>
    );
    
    const getUploadHelperText = () => {
        switch(selectedGame) {
            case 'trap-answer':
                return "يجب أن يكون الملف مصفوفة من الأسئلة. كل سؤال يجب أن يكون كائنًا يحتوي على `question` و `answer`.";
             case 'educated-merchant':
                return "يجب أن يكون الملف مصفوفة من الأسئلة. كل سؤال يجب أن يكون كائنًا يحتوي على `question` و `answer` وحقل اختياري `dummyAnswers` (مصفوفة من الإجابات الخاطئة).";
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
                    <Select onValueChange={(v) => handleGameSelection(v as any)} value={selectedGame}>
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
        
         if (selectedGame === 'trap-answer' || selectedGame === 'educated-merchant') {
             return renderCategorizedGameDelete();
         }
         if (selectedGame === 'word_war') {
             return renderWordWarDelete();
         }
         if (selectedGame === 'prison') {
             return renderPrisonDelete();
         }
         return null;
    };
    
    const renderCategorizedGameDelete = () => (
        <div className="space-y-4">
             <div className="p-3 border rounded-lg space-y-2">
                <Label>حذف حسب النص</Label>
                <div className="flex gap-2">
                    <Input placeholder="نص السؤال..." value={deleteSearchTerm} onChange={(e) => setDeleteSearchTerm(e.target.value)} />
                    <Button onClick={() => handleDeleteClick({ game: selectedGame as 'trap-answer' | 'educated-merchant', searchTerm: deleteSearchTerm })} disabled={!deleteSearchTerm.trim() || isDeleting} variant="destructive">حذف</Button>
                </div>
                <div className="flex gap-2">
                    <Input placeholder="نص الجواب..." value={deleteAnswerSearchTerm} onChange={(e) => setDeleteAnswerSearchTerm(e.target.value)} />
                    <Button onClick={() => handleDeleteClick({ game: selectedGame as 'trap-answer' | 'educated-merchant', answerSearchTerm: deleteAnswerSearchTerm })} disabled={!deleteAnswerSearchTerm.trim() || isDeleting} variant="destructive">حذف</Button>
                </div>
            </div>
            <div className="p-3 border rounded-lg space-y-2">
                <Label>حذف حسب القسم</Label>
                <div className="flex items-center gap-2">
                     <Select onValueChange={setDeleteCategory} value={deleteCategory}>
                        <SelectTrigger>
                            <SelectValue placeholder="اختر قسمًا لحذف كل أسئلته..." />
                        </SelectTrigger>
                        <SelectContent>
                            {currentCategoryList.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        </SelectContent>
                    </Select>
                     <Button onClick={() => handleDeleteClick({ game: selectedGame as 'trap-answer' | 'educated-merchant', category: deleteCategory })} disabled={!deleteCategory || isDeleting} variant="destructive">حذف</Button>
                </div>
            </div>
             <div className="p-3 border rounded-lg space-y-2">
                 <h4 className="font-bold">حذف الأسئلة المكررة</h4>
                 <p className="text-sm text-muted-foreground">سيقوم هذا الإجراء بفحص الأسئلة المتشابهة في قسم معين وحذفها مع الإبقاء على أحدث نسخة.</p>
                 <div className="flex items-center gap-2">
                    <Select onValueChange={setDeleteSimilarityCategory} value={deleteSimilarityCategory}>
                        <SelectTrigger><SelectValue placeholder="اختر قسمًا لفحص التكرارات فيه..." /></SelectTrigger>
                        <SelectContent>
                            {currentCategoryList.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button onClick={() => handleDeleteClick({ game: selectedGame as 'trap-answer' | 'educated-merchant', category: deleteSimilarityCategory, duplicates: true })} disabled={!deleteSimilarityCategory || isDeleting} variant="destructive">
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
                 <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'word_war', all: true })} disabled={isDeleting}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? 'جاري حذف الكل...' : 'تأكيد حذف جميع الكلمات'}
                </Button>
            </div>
            <div className="space-y-2 border-t pt-4">
                 <h4 className="font-bold">حذف الكلمات المكررة</h4>
                 <p className="text-sm text-muted-foreground">سيقوم هذا الإجراء بفحص جميع الكلمات وحذف أي نسخ متطابقة 100%.</p>
                 <Button variant="destructive" className="w-full" onClick={async () => {
                     setIsDeleting(true);
                     const result = await deleteDuplicateWords();
                     if (result.success) {
                         toast({ title: "نجاح", description: `تم حذف ${result.count} كلمة مكررة.`});
                     } else {
                         toast({ title: "خطأ", description: result.error, variant: 'destructive'});
                     }
                     setIsDeleting(false);
                 }} disabled={isDeleting}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {isDeleting ? 'جاري الفحص والحذف...' : 'حذف الكلمات المكررة 100%'}
                </Button>
            </div>
        </div>
    );

    const renderPrisonDelete = () => (
         <div className="space-y-4">
             <div className="p-3 border rounded-lg space-y-2">
                 <h4 className="font-bold">حذف كل أسئلة السجن</h4>
                 <p className="text-sm text-destructive text-center p-2 bg-destructive/10 rounded-md">تحذير! هذا الإجراء سيحذف جميع أسئلة لعبة السجن.</p>
                 <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'prison', all: true })} disabled={isDeleting}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? 'جاري حذف الكل...' : 'تأكيد حذف جميع الأسئلة'}
                </Button>
            </div>
             <div className="p-3 border rounded-lg space-y-2">
                 <h4 className="font-bold">حذف أسئلة السجن المكررة</h4>
                 <p className="text-sm text-muted-foreground">سيقوم هذا الإجراء بفحص الأسئلة المتشابهة وحذفها مع الإبقاء على أحدث نسخة.</p>
                 <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'prison', duplicates: true })} disabled={isDeleting}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {isDeleting ? 'جاري الفحص...' : 'حذف المكررات من السجن'}
                 </Button>
            </div>
         </div>
    );

    const getDialogDescription = () => {
        if (!deletionParams) return '';
        if (deletionParams.duplicates) {
             if (deletionParams.game === 'prison') {
                return 'سيقوم هذا الإجراء بفحص جميع أسئلة السجن وحذف المتشابه منها بناءً على بصمة النص. هل أنت متأكد؟';
            }
            const gameName = deletionParams.game === 'trap-answer' ? "الجواب المفخخ" : "التاجر المتعلم";
            return `سيقوم هذا الإجراء بفحص جميع الأسئلة في قسم "${deletionParams.category}" للعبة "${gameName}" وحذف المتشابه منها بناءً على بصمة النص. هل أنت متأكد؟`;
        }
        if (deletionParams.all) {
             return `تحذير شديد! هذا الإجراء سيحذف جميع العناصر (${deletionCount || 'الكل'}) من قاعدة البيانات بشكل دائم للعبة المحددة. لا يمكن التراجع عن هذا الإجراء.`;
        }
        if (deletionParams.category) {
            return `سيقوم هذا الإجراء بحذف جميع الأسئلة (${deletionCount || 'الكل'}) من قسم "${deletionParams.category}" بشكل دائم.`;
        }
         if (deletionParams.searchTerm) {
            return `سيتم حذف كل الأسئلة التي تحتوي على "${deletionParams.searchTerm}" (${deletionCount || 'الكل'} سؤال). هل أنت متأكد؟`;
        }
        if (deletionParams.answerSearchTerm) {
            return `سيتم حذف كل الأسئلة التي جوابها يحتوي على "${deletionParams.answerSearchTerm}" (${deletionCount || 'الكل'} سؤال). هل أنت متأكد؟`;
        }
        return `هذا الإجراء لا يمكن التراجع عنه. سيتم حذف ${deletionCount || 'الكل'} عنصر بشكل دائم بناءً على المعيار الذي حددته.`
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
                    <Tabs defaultValue="upload" className="w-full" onValueChange={() => handleGameSelection('')}>
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="upload">رفع المحتوى</TabsTrigger>
                            <TabsTrigger value="delete">حذف المحتوى</TabsTrigger>
                        </TabsList>
                        <TabsContent value="upload" className="pt-4">{renderUploadForm()}</TabsContent>
                        <TabsContent value="delete" className="pt-4">{renderDeleteForm()}</TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <div className="md:col-span-1">
                {activeCategoryManager && (
                    <CategoryManager
                        gameType={activeCategoryManager}
                        categories={activeCategoryManager === 'trap-answer' ? trapAnswerCategories : merchantCategories}
                        setCategories={activeCategoryManager === 'trap-answer' ? setTrapAnswerCategories : setMerchantCategories}
                        onAdd={activeCategoryManager === 'trap-answer' ? addTrapAnswerCategory : addEducatedMerchantCategory}
                        onEdit={activeCategoryManager === 'trap-answer' ? editTrapAnswerCategory : editEducatedMerchantCategory}
                        onDelete={activeCategoryManager === 'trap-answer' ? deleteTrapAnswerCategory : deleteEducatedMerchantCategory}
                    />
                )}
            </div>
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
                    {isDeleting ? <Loader2 className="animate-spin" /> : 'نعم، قم بالتأكيد'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
