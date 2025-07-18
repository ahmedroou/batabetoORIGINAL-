
"use client";

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { uploadQuestionsFromJson, deleteQuestions, countQuestions, setFailedDetectiveAnimation, getFailedDetectiveAnimation, removeFailedDetectiveAnimation, TRAP_ANSWER_CATEGORIES, uploadTrapAnswerQuestionsFromJson, deleteSimilarQuestions } from '@/lib/actions/admin';
import { generateTestChallenge } from '@/app/actions';
import { Upload, ArrowLeft, Trash2, Clapperboard, TestTube2, Brain, Apple, Grape, Dices, Save, Puzzle, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GENIUS_CHALLENGES, type GeniusChallenge } from '@/data/genius-challenges';
import type { Game } from '@/types';
import { Timestamp } from 'firebase/firestore';

const ChallengeHost = dynamic(() => import('@/components/game/king-of-genius/ChallengeHost').then(mod => mod.ChallengeHost), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center min-h-[40vh] gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">جاري تحميل التحدي...</p>
        </div>
    )
});


type DeletionParams = { game: 'who-am-i' | 'trap-answer', category?: string; searchTerm?: string; all?: boolean, duplicates?: boolean };

export default function AdminPage() {
    const [isUploadingQuestions, setIsUploadingQuestions] = useState(false);
    const [selectedJsonFile, setSelectedJsonFile] = useState<File | null>(null);
    const { toast } = useToast();
    const router = useRouter();
    const { userProfile, loading } = useAuth();
    
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteCategory, setDeleteCategory] = useState('');
    const [deleteSearchTerm, setDeleteSearchTerm] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [deletionParams, setDeletionParams] = useState<DeletionParams | null>(null);
    const [deletionCount, setDeletionCount] = useState<number | null>(null);
    
    const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const [isDeletingVideo, setIsDeletingVideo] = useState(false);
    const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    
    const [isTestModalOpen, setIsTestModalOpen] = useState(false);
    const [isGeneratingTest, setIsGeneratingTest] = useState(false);
    const [testGame, setTestGame] = useState<Game | null>(null);
    const [testingChallenge, setTestingChallenge] = useState<GeniusChallenge | null>(null);

    const [trapAnswerUploadCategory, setTrapAnswerUploadCategory] = useState<string>("");
    const [trapAnswerDeleteCategory, setTrapAnswerDeleteCategory] = useState<string>("");


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

    useEffect(() => {
        const fetchVideo = async () => {
            const result = await getFailedDetectiveAnimation();
            if (result.success && result.url) {
                setCurrentVideoUrl(result.url);
            }
        };
        fetchVideo();
    }, []);
    
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.load();
        }
    }, [currentVideoUrl]);

    const handleJsonFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const fileInput = event.target;
        if (fileInput.files) {
            setSelectedJsonFile(fileInput.files[0]);
        }
    };
    
    const handleVideoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const file = event.target.files[0];
            const MAX_FILE_SIZE = 750 * 1024; // 750KB
            if (file && file.size > MAX_FILE_SIZE) {
                toast({
                    title: "حجم الفيديو كبير جدًا",
                    description: "تنبيه: الحد الأقصى لحجم الفيديو هو 750 كيلوبايت. الملفات الأكبر ستفشل في الحفظ بسبب قيود قاعدة البيانات.",
                    variant: "destructive"
                });
                if (event.target) event.target.value = '';
                setSelectedVideoFile(null);
                return;
            }
            setSelectedVideoFile(file);
        }
    };


    const handleQuestionUpload = async (gameType: 'who-am-i' | 'trap-answer') => {
        if (!selectedJsonFile) {
            toast({ title: 'لم يتم تحديد ملف', description: 'الرجاء اختيار ملف JSON لرفعه.', variant: 'destructive' });
            return;
        }

        if (gameType === 'trap-answer' && !trapAnswerUploadCategory) {
            toast({ title: 'لم يتم تحديد قسم', description: 'الرجاء اختيار قسم للعبة الجواب الفخ.', variant: 'destructive' });
            return;
        }

        setIsUploadingQuestions(true);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("Failed to read file.");
                
                const json = JSON.parse(text);
                
                let result;
                if (gameType === 'who-am-i') {
                    const questions: { text: string, category: string }[] = json.questions || json;
                    if (!Array.isArray(questions) || !questions.every(q => q && typeof q.text === 'string' && typeof q.category === 'string')) {
                       throw new Error('كل سؤال في لعبة "اكتشف من أنا" يجب أن يكون كائنًا يحتوي على "text" و "category".');
                   }
                    result = await uploadQuestionsFromJson(questions);
                } else { // trap-answer
                    const questions: { question: string, answer: string, dummyAnswers: string[] }[] = json.questions || json;
                     if (!Array.isArray(questions) || !questions.every(q => 
                        q && typeof q.question === 'string' && 
                        typeof q.answer === 'string' &&
                        Array.isArray(q.dummyAnswers) && q.dummyAnswers.length >= 2
                    )) {
                       throw new Error('كل سؤال في لعبة "الجواب الفخ" يجب أن يكون كائنًا يحتوي على "question", "answer", و "dummyAnswers" (مصفوفة من جوابين على الأقل).');
                    }
                    result = await uploadTrapAnswerQuestionsFromJson(questions, trapAnswerUploadCategory);
                }


                if (result.success) {
                    toast({
                        title: 'نجاح',
                        description: `تم رفع ${result.count} سؤال بنجاح.`,
                    });
                    setSelectedJsonFile(null);
                    const fileInput = document.getElementById(gameType === 'who-am-i' ? 'json-upload-who-am-i' : 'json-upload-trap') as HTMLInputElement;
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
                setIsUploadingQuestions(false);
            }
        };
        reader.onerror = () => {
             toast({ title: 'خطأ في قراءة الملف', variant: 'destructive' });
            setIsUploadingQuestions(false);
        };
        reader.readAsText(selectedJsonFile);
    };
    
    const handleVideoUpload = async () => {
        if (!selectedVideoFile) {
             toast({ title: 'لم يتم تحديد ملف فيديو', variant: 'destructive' });
            return;
        }
        
        setIsUploadingVideo(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const dataUri = e.target?.result as string;
                const result = await setFailedDetectiveAnimation(dataUri);
                if (result.success) {
                    toast({ title: "نجاح", description: "تم رفع الفيديو المخصص بنجاح." });
                    setCurrentVideoUrl(dataUri);
                    setSelectedVideoFile(null);
                    if (videoInputRef.current) videoInputRef.current.value = '';
                } else {
                    toast({ title: "خطأ", description: result.error, variant: "destructive" });
                }
            } catch (error) {
                 toast({ title: "خطأ", description: "فشل رفع الفيديو.", variant: "destructive" });
            } finally {
                setIsUploadingVideo(false);
            }
        };
        reader.readAsDataURL(selectedVideoFile);
    };

    const handleVideoRemove = async () => {
        setIsDeletingVideo(true);
        const result = await removeFailedDetectiveAnimation();
        if (result.success) {
            toast({ title: "نجاح", description: "تم حذف الفيديو المخصص. سيتم الآن استخدام الرسوم الافتراضية." });
            setCurrentVideoUrl(null);
            setSelectedVideoFile(null);
            if (videoInputRef.current) videoInputRef.current.value = '';
        } else {
            toast({ title: "خطأ في الحذف", description: result.error, variant: "destructive" });
        }
        setIsDeletingVideo(false);
    };

    const handleDeleteClick = async (params: DeletionParams) => {
        let isValid = params.all || params.duplicates || (params.category && params.category.trim()) || (params.searchTerm && params.searchTerm.trim());
        
        // For duplicates, a category must be selected
        if (params.duplicates && !params.category) {
            if (params.game === 'trap-answer' && !trapAnswerDeleteCategory) {
                 toast({ title: "خطأ", description: "الرجاء اختيار قسم أولاً لحذف التكرارات منه.", variant: "destructive" });
                 isValid = false;
            } else if (params.game === 'who-am-i' && !deleteCategory) {
                 toast({ title: "خطأ", description: "الرجاء إدخال قسم أولاً لحذف التكرارات منه.", variant: "destructive" });
                 isValid = false;
            }
        }
        
        if (!isValid) return;

        setDeletionParams(params);

        if(params.duplicates) {
            setDeletionCount(null); 
            setIsDialogOpen(true);
            return;
        }

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
        setIsDialogOpen(false);

        let result;
        if(deletionParams.duplicates) {
            result = await deleteSimilarQuestions(deletionParams.game, deletionParams.category);
        } else {
            result = await deleteQuestions(deletionParams);
        }
        
        setIsDeleting(false);
        
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        } else if (result.success) {
            const message = `تم بنجاح حذف ${result.count} سؤال. ${result.message || ''}`;
            toast({ title: "نجاح", description: message });
        }
        // Reset inputs
        setDeleteCategory('');
        setDeleteSearchTerm('');
        setTrapAnswerDeleteCategory('');
        setDeletionParams(null);
        setDeletionCount(null);
    };

    const handleTestChallenge = async (challenge: GeniusChallenge) => {
        setIsGeneratingTest(true);
        setTestingChallenge(challenge);
        try {
            const { puzzle } = await generateTestChallenge({ challengeId: challenge.id });
            
            const mockPlayer = { id: 'admin_test', name: 'Admin', avatarId: 'Avatar01.png', status: 'alive' as const, team: 'A' as const };
            
            let durationInSeconds = 90; // Default
            if (challenge.id === 'quick_math') {
                durationInSeconds = 60;
            }
            if (challenge.id === 'code_breaker') {
                durationInSeconds = 45;
            }
            if (challenge.id === 'hidden_maze') {
                durationInSeconds = 40;
            }
            if (challenge.id === 'smart_grid_puzzle') {
                durationInSeconds = 120;
            }


            const mockGame: Game = {
                id: 'TEST_MODE',
                hostId: 'admin_test',
                gameType: 'king-of-genius',
                players: [mockPlayer],
                playerUids: ['admin_test'],
                gameState: 'challenge_active',
                createdAt: Timestamp.now(),
                challengeState: {
                    puzzle: puzzle,
                    results: [],
                    playerProgress: {},
                    challengeEndsAt: Timestamp.fromMillis(Date.now() + durationInSeconds * 1000),
                },
            };

            setTestGame(mockGame);
            setIsTestModalOpen(true);

        } catch (error: any) {
            toast({
                title: "Error Generating Test",
                description: error.message || "Could not generate the test puzzle.",
                variant: "destructive",
            });
        } finally {
            setIsGeneratingTest(false);
        }
    };
    
    if (loading || !userProfile?.isAdmin) {
        return null;
    }
    
    const renderWhoAmIQuestions = () => (
         <TabsContent value="upload" className="pt-4 space-y-4">
            <div className="space-y-2">
                <Label htmlFor="json-upload-who-am-i">ملف الأسئلة (JSON)</Label>
                <Input id="json-upload-who-am-i" type="file" accept=".json" onChange={handleJsonFileChange} />
                <p className="text-xs text-muted-foreground">
                    يجب أن يحتوي الملف على مفتاح `questions` بداخله مصفوفة من كائنات الأسئلة، كل كائن يحتوي على `text` و `category`.
                </p>
            </div>
            <Button onClick={() => handleQuestionUpload('who-am-i')} disabled={isUploadingQuestions || !selectedJsonFile} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {isUploadingQuestions ? 'جاري الرفع...' : 'رفع ملف "اكتشف من أنا"'}
            </Button>
        </TabsContent>
    );

    const renderTrapAnswerQuestions = () => (
        <TabsContent value="upload-trap" className="pt-4 space-y-4">
            <div className="space-y-2">
                <Label htmlFor="trap-category-select">اختر القسم</Label>
                <Select onValueChange={setTrapAnswerUploadCategory} value={trapAnswerUploadCategory}>
                    <SelectTrigger id="trap-category-select">
                        <SelectValue placeholder="اختر قسمًا لإضافة الأسئلة إليه..." />
                    </SelectTrigger>
                    <SelectContent>
                        {TRAP_ANSWER_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
             <div className="space-y-2">
                <Label htmlFor="json-upload-trap">ملف الأسئلة (JSON)</Label>
                <Input id="json-upload-trap" type="file" accept=".json" onChange={handleJsonFileChange} />
                <p className="text-xs text-muted-foreground">
                    الملف يجب أن يكون مصفوفة من الأسئلة. كل سؤال يجب أن يحتوي على `question` (نص)، `answer` (نص)، و `dummyAnswers` (مصفوفة من جوابين نصيين).
                </p>
            </div>
            <Button onClick={() => handleQuestionUpload('trap-answer')} disabled={isUploadingQuestions || !selectedJsonFile || !trapAnswerUploadCategory} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {isUploadingQuestions ? 'جاري الرفع...' : 'رفع ملف "الجواب الفخ"'}
            </Button>
        </TabsContent>
    );

    const renderWhoAmIDelete = () => (
        <TabsContent value="delete-who-am-i" className="pt-4">
            <Tabs defaultValue="category">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="category">حسب القسم</TabsTrigger>
                    <TabsTrigger value="search">حسب النص</TabsTrigger>
                </TabsList>
                <TabsContent value="category" className="space-y-4 pt-4">
                    <Label htmlFor="category-delete-whoami">اسم القسم</Label>
                    <Input id="category-delete-whoami" value={deleteCategory} onChange={(e) => setDeleteCategory(e.target.value)} placeholder="مثال: اكتشف من انا" />
                    <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'who-am-i', category: deleteCategory })} disabled={!deleteCategory.trim() || isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? 'جاري الحذف...' : 'حذف كل أسئلة القسم'}
                    </Button>
                </TabsContent>
                <TabsContent value="search" className="space-y-4 pt-4">
                    <Label htmlFor="search-delete-whoami">كلمة أو جملة للبحث</Label>
                    <Input id="search-delete-whoami" value={deleteSearchTerm} onChange={(e) => setDeleteSearchTerm(e.target.value)} placeholder="اكتب كلمة أو جملة هنا..." />
                    <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'who-am-i', searchTerm: deleteSearchTerm })} disabled={!deleteSearchTerm.trim() || isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? 'جاري الحذف...' : 'حذف الأسئلة المطابقة'}
                    </Button>
                </TabsContent>
            </Tabs>
            <div className="mt-4 border-t pt-4 border-destructive/50">
                <h4 className="text-destructive font-bold mb-2">منطقة الخطر</h4>
                 <div className="grid grid-cols-2 gap-2">
                    <Button variant="destructive" onClick={() => handleDeleteClick({ game: 'who-am-i', all: true })} disabled={isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? '...' : 'حذف الكل'}
                    </Button>
                    <Button variant="destructive" onClick={() => handleDeleteClick({ game: 'who-am-i', duplicates: true, category: deleteCategory })} disabled={isDeleting || !deleteCategory.trim()}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {isDeleting ? '...' : 'حذف المكرر بالقسم'}
                    </Button>
                 </div>
                 <p className="text-xs text-muted-foreground mt-2">لحذف التكرارات، يجب عليك أولاً إدخال اسم القسم في حقل "حسب القسم".</p>
            </div>
        </TabsContent>
    );
    
    const renderTrapAnswerDelete = () => (
        <TabsContent value="delete-trap" className="pt-4">
            <Tabs defaultValue="category">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="category">حسب القسم</TabsTrigger>
                    <TabsTrigger value="search">حسب النص</TabsTrigger>
                </TabsList>
                <TabsContent value="category" className="space-y-4 pt-4">
                    <Label htmlFor="category-delete-trap">اختر القسم للحذف منه</Label>
                    <Select onValueChange={setTrapAnswerDeleteCategory} value={trapAnswerDeleteCategory}>
                        <SelectTrigger id="category-delete-trap">
                            <SelectValue placeholder="اختر قسمًا..." />
                        </SelectTrigger>
                        <SelectContent>
                             {TRAP_ANSWER_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'trap-answer', category: trapAnswerDeleteCategory })} disabled={!trapAnswerDeleteCategory || isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? 'جاري الحذف...' : `حذف كل أسئلة قسم "${trapAnswerDeleteCategory}"`}
                    </Button>
                </TabsContent>
                <TabsContent value="search" className="space-y-4 pt-4">
                    <Label htmlFor="search-delete-trap">كلمة أو جملة للبحث</Label>
                    <Input id="search-delete-trap" value={deleteSearchTerm} onChange={(e) => setDeleteSearchTerm(e.target.value)} placeholder="اكتب كلمة أو جملة هنا..." />
                    <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ game: 'trap-answer', searchTerm: deleteSearchTerm })} disabled={!deleteSearchTerm.trim() || isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? 'جاري الحذف...' : 'حذف الأسئلة المطابقة'}
                    </Button>
                </TabsContent>
            </Tabs>
            <div className="mt-4 border-t pt-4 border-destructive/50">
                <h4 className="text-destructive font-bold mb-2">منطقة الخطر</h4>
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="destructive" onClick={() => handleDeleteClick({ game: 'trap-answer', all: true })} disabled={isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? '...' : 'حذف الكل'}
                    </Button>
                    <Button variant="destructive" onClick={() => handleDeleteClick({ game: 'trap-answer', duplicates: true, category: trapAnswerDeleteCategory })} disabled={isDeleting || !trapAnswerDeleteCategory}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {isDeleting ? '...' : 'حذف المكرر بالقسم'}
                    </Button>
                 </div>
                 <p className="text-xs text-muted-foreground mt-2">لحذف التكرارات، يجب عليك أولاً اختيار القسم من قائمة "حسب القسم".</p>
            </div>
        </TabsContent>
    );


    const getDialogDescription = () => {
        if (!deletionParams) return '';

        if (deletionParams.duplicates) {
            return `سيقوم هذا الإجراء بفحص جميع الأسئلة في قسم "${deletionParams.category}" والعثور على الأسئلة المتشابهة بنسبة ~95% وحذفها، مع الإبقاء على النسخة الأحدث. هل أنت متأكد؟`;
        }

        if (deletionParams.all) {
             return `تحذير شديد! هذا الإجراء سيحذف جميع الأسئلة (${deletionCount}) من قاعدة البيانات بشكل دائم للعبة المحددة. لا يمكن التراجع عن هذا الإجراء.`;
        }

        return `هذا الإجراء لا يمكن التراجع عنه. سيتم حذف ${deletionCount} سؤال بشكل دائم بناءً على المعيار الذي حددته.`
    };


    return (
        <main className="flex min-h-screen flex-col items-center p-4 bg-muted/40">
            <div className="w-full max-w-4xl space-y-8 py-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold">لوحة تحكم الأدمن</h1>
                    <p className="text-muted-foreground">إدارة محتوى اللعبة وإعداداتها.</p>
                     <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="absolute top-8 right-8">
                        <ArrowLeft />
                    </Button>
                </div>

                <Tabs defaultValue="questions" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="questions">إدارة الأسئلة</TabsTrigger>
                        <TabsTrigger value="animations">الرسوم</TabsTrigger>
                        <TabsTrigger value="testing">الاختبار</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="questions">
                        <Card>
                             <CardHeader>
                                <CardTitle>إدارة الأسئلة</CardTitle>
                                <CardDescription>
                                    رفع وحذف الأسئلة المستخدمة في الألعاب المختلفة.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                               <Tabs defaultValue="who-am-i" className="w-full">
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="who-am-i">لعبة اكتشف من أنا؟</TabsTrigger>
                                        <TabsTrigger value="trap-answer">لعبة الجواب الفخ</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="who-am-i">
                                        <Tabs defaultValue="upload" className="w-full pt-2">
                                             <TabsList className="grid w-full grid-cols-2">
                                                <TabsTrigger value="upload">رفع الأسئلة</TabsTrigger>
                                                <TabsTrigger value="delete-who-am-i">حذف الأسئلة</TabsTrigger>
                                             </TabsList>
                                             {renderWhoAmIQuestions()}
                                             {renderWhoAmIDelete()}
                                        </Tabs>
                                    </TabsContent>
                                    <TabsContent value="trap-answer">
                                         <Tabs defaultValue="upload-trap" className="w-full pt-2">
                                             <TabsList className="grid w-full grid-cols-2">
                                                <TabsTrigger value="upload-trap">رفع الأسئلة</TabsTrigger>
                                                <TabsTrigger value="delete-trap">حذف الأسئلة</TabsTrigger>
                                             </TabsList>
                                             {renderTrapAnswerQuestions()}
                                             {renderTrapAnswerDelete()}
                                        </Tabs>
                                    </TabsContent>
                               </Tabs>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="animations">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Clapperboard />
                                    تخصيص الرسوم المتحركة
                                </CardTitle>
                                <CardDescription>
                                    استبدل الرسوم المتحركة الافتراضية بمقاطع فيديو من جهازك.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <h4 className="font-semibold">عقاب المحقق الفاشل</h4>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        هذا الفيديو سيظهر عند فوز القاتل.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                        <div className="space-y-2">
                                            <Label htmlFor="video-upload">ملف الفيديو (mp4, webm)</Label>
                                            <Input ref={videoInputRef} id="video-upload" type="file" accept="video/mp4,video/webm" onChange={handleVideoFileChange} />
                                            <Alert variant="destructive">
                                                <AlertTitle>تحذير</AlertTitle>
                                                <AlertDescription>
                                                    الحد الأقصى لحجم الفيديو هو 750 كيلوبايت بسبب قيود قاعدة البيانات. الملفات الأكبر ستفشل في الحفظ.
                                                </AlertDescription>
                                            </Alert>
                                            <div className="flex gap-2">
                                                <Button onClick={handleVideoUpload} disabled={isUploadingVideo || !selectedVideoFile} className="flex-grow">
                                                    <Upload className="mr-2 h-4 w-4" />
                                                    {isUploadingVideo ? 'جاري الرفع...' : 'رفع الفيديو'}
                                                </Button>
                                                {currentVideoUrl && (
                                                    <Button variant="destructive" size="icon" onClick={handleVideoRemove} disabled={isDeletingVideo} aria-label="حذف الفيديو المخصص">
                                                        {isDeletingVideo ? "..." : <Trash2 className="h-4 w-4" />}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="bg-muted rounded-lg aspect-square flex items-center justify-center">
                                            {currentVideoUrl ? (
                                                <video ref={videoRef} key={currentVideoUrl} controls loop className="w-full h-full object-cover rounded-lg">
                                                    <source src={currentVideoUrl} />
                                                    متصفحك لا يدعم عرض الفيديو.
                                                </video>
                                            ) : (
                                                <p className="text-muted-foreground text-center p-4">لا يوجد فيديو مخصص. سيتم استخدام الرسوم الافتراضية.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="testing">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <TestTube2 />
                                    تجربة تحديات ساحة العباقرة
                                </CardTitle>
                                <CardDescription>
                                    قم بتوليد وتجربة أي من التحديات بشكل فوري لأغراض الاختبار.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {GENIUS_CHALLENGES.map((challenge) => (
                                    <Button 
                                        key={challenge.id} 
                                        variant="outline" 
                                        onClick={() => handleTestChallenge(challenge)}
                                        disabled={isGeneratingTest}
                                        className='h-auto py-3'
                                    >
                                        {isGeneratingTest && testingChallenge?.id === challenge.id ? "جاري..." : `تجربة: ${challenge.name}`}
                                    </Button>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

            </div>

            <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    {getDialogDescription()}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setIsDialogOpen(false)}>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmDelete} className={buttonVariants({ variant: "destructive" })} disabled={isDeleting}>
                    {isDeleting ? 'جاري العمل...' : 'نعم، قم بالحذف'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            <Dialog open={isTestModalOpen} onOpenChange={(isOpen) => { setIsTestModalOpen(isOpen); if (!isOpen) setTestGame(null); }}>
                <DialogContent className="max-w-4xl bg-slate-50">
                    <DialogHeader>
                        <DialogTitle>اختبار: {testingChallenge?.name}</DialogTitle>
                        <DialogDescription>{testingChallenge?.description}</DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center justify-center p-4 min-h-[60vh] bg-slate-100 rounded-md">
                        {testGame && testingChallenge && (
                            <ChallengeHost 
                                game={testGame}
                                player={testGame.players[0]}
                                self={testGame.players[0]}
                                challenge={testingChallenge}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </main>
    );
}
