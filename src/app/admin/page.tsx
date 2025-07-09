
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { uploadQuestionsFromJson, deleteQuestions, countQuestions, setFailedDetectiveAnimation, getFailedDetectiveAnimation, removeFailedDetectiveAnimation } from '@/lib/actions/admin';
import { generateTestChallenge } from '@/app/actions';
import { Upload, ArrowLeft, Trash2, Clapperboard, TestTube2 } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { GENIUS_CHALLENGES, type GeniusChallenge } from '@/data/genius-challenges';
import type { Game } from '@/types';
import { ChallengeHost } from '@/components/game/king-of-genius/ChallengeHost';


type DeletionParams = { category?: string; searchTerm?: string; all?: boolean };

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
        if (event.target.files) {
            setSelectedJsonFile(event.target.files[0]);
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

    const handleQuestionUpload = async () => {
        if (!selectedJsonFile) {
            toast({
                title: 'لم يتم تحديد ملف',
                description: 'الرجاء اختيار ملف JSON لرفعه.',
                variant: 'destructive',
            });
            return;
        }

        setIsUploadingQuestions(true);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("Failed to read file.");
                
                const json = JSON.parse(text);
                if (!json.questions || !Array.isArray(json.questions)) {
                     throw new Error('يجب أن يحتوي ملف JSON على مفتاح "questions" بداخله مصفوفة.');
                }

                const questions: { text: string; category: string }[] = json.questions;
                 if (!questions.every(q => q && typeof q.text === 'string' && typeof q.category === 'string')) {
                    throw new Error('كل سؤال في المصفوفة يجب أن يكون كائنًا يحتوي على "text" و "category".');
                }
                
                const result = await uploadQuestionsFromJson(questions);

                if (result.success) {
                    toast({
                        title: 'نجاح',
                        description: `تم رفع ${result.count} سؤال بنجاح.`,
                    });
                    setSelectedJsonFile(null);
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

    const handleTestChallenge = async (challenge: GeniusChallenge) => {
        setIsGeneratingTest(true);
        setTestingChallenge(challenge);
        try {
            const { puzzle } = await generateTestChallenge({ challengeId: challenge.id });
            
            const mockPlayer = { id: 'admin_test', name: 'Admin', avatarId: 'Avatar01', status: 'alive' as const, team: 'A' as const };

            const mockGame: Game = {
                id: 'TEST_MODE',
                hostId: 'admin_test',
                gameType: 'king-of-genius',
                players: [mockPlayer],
                playerUids: ['admin_test'],
                gameState: 'challenge_active',
                createdAt: new Date() as any,
                challengeState: {
                    puzzle: puzzle,
                    results: [],
                    playerProgress: {},
                    challengeEndsAt: new Date(Date.now() + 120 * 1000) as any,
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
            // Don't reset testingChallenge here so the modal can use it
        }
    };
    
    if (loading) {
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
    
    if (!userProfile?.isAdmin) {
        return null;
    }


    return (
        <main className="flex min-h-screen flex-col items-center p-4 bg-muted/40">
            <div className="w-full max-w-2xl space-y-8 py-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold">لوحة تحكم الأدمن</h1>
                    <p className="text-muted-foreground">إدارة محتوى اللعبة وإعداداتها.</p>
                     <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="absolute top-8 right-8">
                        <ArrowLeft />
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>إدارة الأسئلة</CardTitle>
                        <CardDescription>
                            رفع وحذف الأسئلة المستخدمة في لعبة "اكتشف من أنا؟".
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                       <Tabs defaultValue="upload">
                         <TabsList className="grid w-full grid-cols-2">
                           <TabsTrigger value="upload">رفع أسئلة جديدة</TabsTrigger>
                           <TabsTrigger value="delete">حذف الأسئلة</TabsTrigger>
                         </TabsList>
                         <TabsContent value="upload" className="pt-4 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="json-upload">ملف الأسئلة (JSON)</Label>
                                <Input id="json-upload" type="file" accept=".json" onChange={handleJsonFileChange} />
                                <p className="text-xs text-muted-foreground">
                                    يجب أن يحتوي الملف على مفتاح `questions` بداخله مصفوفة من كائنات الأسئلة، كل كائن يحتوي على `text` و `category`.
                                </p>
                            </div>
                            <Button onClick={handleQuestionUpload} disabled={isUploadingQuestions || !selectedJsonFile} className="w-full">
                                <Upload className="mr-2 h-4 w-4" />
                                {isUploadingQuestions ? 'جاري الرفع...' : 'رفع الملف'}
                            </Button>
                         </TabsContent>
                         <TabsContent value="delete" className="pt-4">
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
                           <div className="mt-4 border-t pt-4 border-destructive/50">
                             <h4 className="text-destructive font-bold mb-2">منطقة الخطر</h4>
                             <Button variant="destructive" className="w-full" onClick={() => handleDeleteClick({ all: true })} disabled={isDeleting}>
                               <Trash2 className="mr-2 h-4 w-4" />
                               {isDeleting ? 'جاري الحذف...' : 'حذف جميع الأسئلة'}
                             </Button>
                           </div>
                         </TabsContent>
                       </Tabs>
                    </CardContent>
                </Card>
                
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
                    <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {GENIUS_CHALLENGES.map((challenge) => (
                            <Button 
                                key={challenge.id} 
                                variant="outline" 
                                onClick={() => handleTestChallenge(challenge)}
                                disabled={isGeneratingTest}
                            >
                                {isGeneratingTest && testingChallenge?.id === challenge.id ? "جاري..." : `تجربة: ${challenge.name}`}
                            </Button>
                        ))}
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
