
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { uploadQuestionsFromJson, deleteQuestions, countQuestions, setFailedDetectiveAnimation, getFailedDetectiveAnimation, removeFailedDetectiveAnimation, TRAP_ANSWER_CATEGORIES, uploadTrapAnswerQuestionsFromJson, deleteSimilarQuestions, getAnnouncement, setAnnouncement } from '@/lib/actions/admin';
import { generateTestChallenge, searchUsers, adminUpdateUser, setAvatarPrices, getAvatarPrices, getSocialRanks, setSocialRanks } from '@/app/actions';
import { Upload, ArrowLeft, Trash2, Clapperboard, TestTube2, Brain, Apple, Grape, Dices, Save, Puzzle, Loader2, Sparkles, Megaphone, Users, Search, CircleDollarSign, Edit, Trophy, Plus, X, Shield } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GENIUS_CHALLENGES, type GeniusChallenge } from '@/data/genius-challenges';
import type { Game, UserProfile, AvatarPrice, SocialRank } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { Textarea } from '@/components/ui/textarea';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { AVATAR_IDS } from '@/data/avatars';
import { getSocialRanksForUser } from '@/lib/actions/user';


const ChallengeHost = dynamic(() => import('@/components/game/king-of-genius/ChallengeHost').then(mod => mod.ChallengeHost), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center min-h-[40vh] gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">جاري تحميل التحدي...</p>
        </div>
    )
});


type DeletionParams = { 
    game: 'trap-answer'; 
    category?: string; 
    searchTerm?: string; 
    answerSearchTerm?: string; 
    all?: boolean; 
    duplicates?: { threshold: number };
};

export default function AdminPage() {
    const { toast } = useToast();
    const router = useRouter();
    const { user, userProfile, loading, socialRanks: allSocialRanks } = useAuth();

    // States for Question Management
    const [isUploadingQuestions, setIsUploadingQuestions] = useState(false);
    const [selectedJsonFile, setSelectedJsonFile] = useState<File | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteSearchTerm, setDeleteSearchTerm] = useState('');
    const [deleteAnswerSearchTerm, setDeleteAnswerSearchTerm] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [deletionParams, setDeletionParams] = useState<DeletionParams | null>(null);
    const [deletionCount, setDeletionCount] = useState<number | null>(null);
    const [trapAnswerUploadCategory, setTrapAnswerUploadCategory] = useState<string>("");
    const [trapAnswerDeleteCategory, setTrapAnswerDeleteCategory] = useState<string>("");
    
    // States for Animation Management
    const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const [isDeletingVideo, setIsDeletingVideo] = useState(false);
    const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    // States for Challenge Testing
    const [isTestModalOpen, setIsTestModalOpen] = useState(false);
    const [isGeneratingTest, setIsGeneratingTest] = useState(false);
    const [testGame, setTestGame] = useState<Game | null>(null);
    const [testingChallenge, setTestingChallenge] = useState<GeniusChallenge | null>(null);

    // States for Announcement
    const [announcementText, setAnnouncementText] = useState("");
    const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);

    // States for User Management
    const [userSearchTerm, setUserSearchTerm] = useState("");
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [searchedUsers, setSearchedUsers] = useState<UserProfile[]>([]);
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [editingCoins, setEditingCoins] = useState<string>("");

    // States for Avatar Store
    const [avatarPrices, setAvatarPrices] = useState<Record<string, number>>({});
    const [isLoadingPrices, setIsLoadingPrices] = useState(true);
    const [isSavingPrices, setIsSavingPrices] = useState(false);

    // States for Social Ranks
    const [socialRanks, setSocialRanks] = useState<SocialRank[]>([]);
    const [isLoadingRanks, setIsLoadingRanks] = useState(true);
    const [isSavingRanks, setIsSavingRanks] = useState(false);

    // Debounce search
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!loading && !userProfile?.isAdmin) {
            router.push('/');
        }
    }, [userProfile, loading, router]);

    const fetchAdminData = useCallback(async () => {
        setIsLoadingPrices(true);
        setIsLoadingRanks(true);

        const videoResult = await getFailedDetectiveAnimation();
        if (videoResult.success && videoResult.url) {
            setCurrentVideoUrl(videoResult.url);
        }
        
        const announcementResult = await getAnnouncement();
        if (announcementResult.success && announcementResult.text) {
            setAnnouncementText(announcementResult.text);
        }
        
        const pricesResult = await getAvatarPrices();
        if (pricesResult.success && pricesResult.prices) {
            const pricesMap = pricesResult.prices.reduce((acc, item) => {
                acc[item.id] = item.price;
                return acc;
            }, {} as Record<string, number>);
            setAvatarPrices(pricesMap);
        }
        setIsLoadingPrices(false);

        const ranksResult = await getSocialRanks();
        if (ranksResult.success && ranksResult.ranks) {
            setSocialRanks(ranksResult.ranks.sort((a,b) => a.threshold - b.threshold));
        }
        setIsLoadingRanks(false);
    }, []);

    useEffect(() => {
        if(userProfile?.isAdmin) {
          fetchAdminData();
        }
    }, [userProfile?.isAdmin, fetchAdminData]);
    
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.load();
        }
    }, [currentVideoUrl]);
    
    const handleSearchTermChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const term = e.target.value;
        setUserSearchTerm(term);
        
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }
        
        if (term.trim() === '') {
            setSearchedUsers([]);
            return;
        }

        setIsSearchingUsers(true);
        debounceTimeout.current = setTimeout(async () => {
            const users = await searchUsers(term);
            setSearchedUsers(users);
            setIsSearchingUsers(false);
        }, 500); // 500ms delay
    };

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

    const handleQuestionUpload = async () => {
        if (!selectedJsonFile) {
            toast({ title: 'لم يتم تحديد ملف', description: 'الرجاء اختيار ملف JSON لرفعه.', variant: 'destructive' });
            return;
        }
        if (!trapAnswerUploadCategory) {
            toast({ title: 'لم يتم تحديد قسم', description: 'الرجاء اختيار قسم للعبة الجواب المفخخ.', variant: 'destructive' });
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
                const questions: { question: string, answer: string, dummyAnswers: string[] }[] = Array.isArray(json) ? json : json.questions;
                 if (!Array.isArray(questions) || !questions.every(q => 
                    q && typeof q.question === 'string' && 
                    typeof q.answer === 'string' &&
                    Array.isArray(q.dummyAnswers) && q.dummyAnswers.length >= 2
                )) {
                   throw new Error('كل سؤال في لعبة "الجواب المفخخ" يجب أن يكون كائنًا يحتوي على "question", "answer", و "dummyAnswers" (مصفوفة من جوابين نصيين على الأقل).');
                }
                result = await uploadTrapAnswerQuestionsFromJson(questions, trapAnswerUploadCategory);

                if (result.success) {
                    toast({
                        title: 'نجاح',
                        description: `تم رفع ${result.count} سؤال بنجاح.`,
                    });
                    setSelectedJsonFile(null);
                    const fileInput = document.getElementById('json-upload-trap') as HTMLInputElement;
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
            result = await deleteSimilarQuestions(deletionParams.game, deletionParams.duplicates.threshold, deletionParams.category);
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
        setDeleteSearchTerm('');
        setDeleteAnswerSearchTerm('');
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
            if (challenge.id === 'quick_math') durationInSeconds = 60;
            if (challenge.id === 'code_breaker') durationInSeconds = 45;
            if (challenge.id === 'hidden_maze') durationInSeconds = 40;
            if (challenge.id === 'smart_grid_puzzle') durationInSeconds = 120;

            const mockGame: Game = {
                id: 'TEST_MODE', hostId: 'admin_test', gameType: 'king-of-genius',
                players: [mockPlayer], playerUids: ['admin_test'], gameState: 'challenge_active',
                createdAt: Timestamp.now(),
                challengeState: {
                    puzzle: puzzle, results: [], playerProgress: {},
                    challengeEndsAt: Timestamp.fromMillis(Date.now() + durationInSeconds * 1000),
                },
            };
            setTestGame(mockGame);
            setIsTestModalOpen(true);
        } catch (error: any) {
            toast({ title: "Error Generating Test", description: error.message || "Could not generate the test puzzle.", variant: "destructive" });
        } finally {
            setIsGeneratingTest(false);
        }
    };
    
    const handleSaveAnnouncement = async () => {
        setIsSavingAnnouncement(true);
        const result = await setAnnouncement(announcementText);
        if (result.success) {
            toast({ title: "تم حفظ الإعلان بنجاح." });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSavingAnnouncement(false);
    };
        
    const handleUpdateUser = async () => {
        if (!editingUser) return;
        const coins = parseInt(editingCoins, 10);
        if (isNaN(coins)) {
            toast({ title: "قيمة غير صالحة", description: "الرجاء إدخال رقم صحيح للكوينز.", variant: "destructive" });
            return;
        }
        const result = await adminUpdateUser(editingUser.uid, { coins });
        if(result.success) {
            toast({title: "تم تحديث المستخدم بنجاح."});
            setEditingUser(null);
            setSearchedUsers(users => users.map(u => u.uid === editingUser.uid ? {...u, coins } : u));
        } else {
            toast({title: "خطأ في التحديث", description: result.error, variant: "destructive"});
        }
    }

    const handleSavePrices = async () => {
        setIsSavingPrices(true);
        const pricesArray: AvatarPrice[] = Object.entries(avatarPrices).map(([id, price]) => ({
            id,
            price: Number.isNaN(price) ? 0 : price,
        }));
        const result = await setAvatarPrices(pricesArray);
        if (result.success) {
            toast({ title: "تم حفظ أسعار الشخصيات بنجاح!" });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSavingPrices(false);
    };

    const handlePriceChange = (id: string, value: string) => {
        const price = parseInt(value, 10);
        setAvatarPrices(prev => ({
            ...prev,
            [id]: Number.isNaN(price) ? 0 : price,
        }));
    };

    const handleRankChange = (index: number, field: 'name' | 'threshold', value: string | number) => {
        const newRanks = [...socialRanks];
        if(field === 'name') newRanks[index].name = String(value);
        if(field === 'threshold') newRanks[index].threshold = Number(value);
        setSocialRanks(newRanks);
    };

    const handleAddRank = () => {
        const lastThreshold = socialRanks[socialRanks.length - 1]?.threshold || 0;
        setSocialRanks([...socialRanks, { name: 'لقب جديد', threshold: lastThreshold + 100 }]);
    };
    
    const handleRemoveRank = (index: number) => {
        if (socialRanks.length > 1) {
            const newRanks = socialRanks.filter((_, i) => i !== index);
            setSocialRanks(newRanks);
        } else {
            toast({title: "لا يمكن حذف آخر لقب", variant: "destructive"});
        }
    };

    const handleSaveRanks = async () => {
        setIsSavingRanks(true);
        const result = await setSocialRanks(socialRanks);
        if (result.success) {
            toast({title: "تم حفظ الألقاب بنجاح"});
        } else {
            toast({title: "خطأ في الحفظ", description: result.error, variant: "destructive"});
        }
        setIsSavingRanks(false);
    }

    if (loading) return null;
    if (!userProfile?.isAdmin) {
        router.push('/');
        return null;
    }

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
            <Button onClick={() => handleQuestionUpload()} disabled={isUploadingQuestions || !selectedJsonFile || !trapAnswerUploadCategory} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {isUploadingQuestions ? 'جاري الرفع...' : 'رفع ملف "الجواب المفخخ"'}
            </Button>
        </TabsContent>
    );

    const renderTrapAnswerDelete = () => (
        <TabsContent value="delete-trap" className="pt-4">
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
                             {TRAP_ANSWER_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
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
        </TabsContent>
    );

    const getDialogDescription = () => {
        if (!deletionParams) return '';
        if (deletionParams.duplicates) {
            return `سيقوم هذا الإجراء بفحص جميع الأسئلة في قسم "${deletionParams.category}" وحذف الأسئلة المتشابهة بنسبة ${deletionParams.duplicates.threshold * 100}% أو أكثر، مع الإبقاء على النسخة الأحدث. سيتم حذف ${deletionCount} سؤال. هل أنت متأكد؟`;
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

                <Tabs defaultValue="users" className="w-full">
                    <TabsList className="grid w-full grid-cols-7">
                        <TabsTrigger value="users">إدارة المستخدمين</TabsTrigger>
                        <TabsTrigger value="avatars">متجر الشخصيات</TabsTrigger>
                        <TabsTrigger value="ranks">إدارة الألقاب</TabsTrigger>
                        <TabsTrigger value="questions">إدارة الأسئلة</TabsTrigger>
                        <TabsTrigger value="announcements">الإعلانات</TabsTrigger>
                        <TabsTrigger value="animations">الرسوم</TabsTrigger>
                        <TabsTrigger value="testing">الاختبار</TabsTrigger>
                    </TabsList>

                     <TabsContent value="users">
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Users /> إدارة المستخدمين</CardTitle>
                                <CardDescription>ابحث عن مستخدم وقم بتعديل بياناته مثل رصيد الكوينز.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex gap-2 relative">
                                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        placeholder="ابحث بالاسم أو البريد الإلكتروني..."
                                        value={userSearchTerm}
                                        onChange={handleSearchTermChange}
                                        className="pr-10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    {isSearchingUsers && <div className="text-center p-4"><Loader2 className="animate-spin" /></div>}
                                    {searchedUsers.map(user => {
                                        const rank = getSocialRanksForUser(user.leaderboardPoints, allSocialRanks);
                                        return (
                                            <div key={user.uid} className="flex justify-between items-center p-2 bg-muted rounded-md">
                                                <div className='flex items-center gap-2'>
                                                    <PlayerAvatar avatarId={user.avatarId} className="w-10 h-10"/>
                                                    <div>
                                                        <p className='font-bold flex items-center gap-1.5'>
                                                            <Shield className="w-4 h-4 text-amber-500" />
                                                            {rank?.name}: {user.name}
                                                        </p>
                                                        <p className='text-xs text-muted-foreground'>{user.email}</p>
                                                    </div>
                                                </div>
                                                <div className='flex items-center gap-2'>
                                                    <CircleDollarSign className='text-yellow-500'/>
                                                    <span className='font-bold'>{user.coins}</span>
                                                    <Button size="icon" variant="ghost" onClick={() => { setEditingUser(user); setEditingCoins(String(user.coins)); }}>
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="avatars">
                         <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Users /> متجر الشخصيات</CardTitle>
                                <CardDescription>حدد أسعار الشخصيات بالكوينز. السعر 0 يجعلها مجانية. السعر الفارغ يعني أنها غير قابلة للشراء.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isLoadingPrices ? <Loader2 className="animate-spin" /> : (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {AVATAR_IDS.map(avatarId => (
                                            <div key={avatarId} className="space-y-2 p-2 border rounded-lg">
                                                <PlayerAvatar avatarId={avatarId} className="w-24 h-24 mx-auto"/>
                                                <div className="flex items-center gap-2">
                                                   <CircleDollarSign className="w-4 h-4 text-yellow-500" />
                                                   <Input 
                                                        type="number"
                                                        placeholder="السعر"
                                                        value={avatarPrices[avatarId] || ''}
                                                        onChange={(e) => handlePriceChange(avatarId, e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter>
                                <Button onClick={handleSavePrices} disabled={isSavingPrices} className="w-full">
                                    <Save className="mr-2"/>
                                    {isSavingPrices ? "جاري الحفظ..." : "حفظ الأسعار"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                     <TabsContent value="ranks">
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Trophy /> إدارة الألقاب</CardTitle>
                                <CardDescription>حدد الألقاب ونقاط الصدارة المطلوبة للحصول عليها.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isLoadingRanks ? <Loader2 className="animate-spin" /> : (
                                   <div className='space-y-2'>
                                        {socialRanks.map((rank, index) => (
                                            <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                               <Input 
                                                   value={rank.name}
                                                   onChange={e => handleRankChange(index, 'name', e.target.value)}
                                                   placeholder="اسم اللقب"
                                                   className="flex-grow"
                                               />
                                               <Input 
                                                   type="number"
                                                   value={rank.threshold}
                                                   onChange={e => handleRankChange(index, 'threshold', e.target.value)}
                                                   placeholder="النقاط المطلوبة"
                                                   className="w-32"
                                               />
                                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleRemoveRank(index)}>
                                                    <X className="w-4 h-4"/>
                                                </Button>
                                            </div>
                                        ))}
                                        <Button variant="outline" onClick={handleAddRank} className="w-full">
                                            <Plus className="mr-2"/> إضافة لقب جديد
                                        </Button>
                                   </div>
                                )}
                            </CardContent>
                             <CardFooter>
                                <Button onClick={handleSaveRanks} disabled={isSavingRanks} className="w-full">
                                    <Save className="mr-2"/>
                                    {isSavingRanks ? "جاري الحفظ..." : "حفظ الألقاب"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="questions">
                        <Card>
                             <CardHeader>
                                <CardTitle>إدارة أسئلة الجواب المفخخ</CardTitle>
                                <CardDescription>رفع وحذف الأسئلة المستخدمة في لعبة الجواب المفخخ.</CardDescription>
                            </CardHeader>
                            <CardContent>
                               <Tabs defaultValue="upload-trap" className="w-full">
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="upload-trap">رفع الأسئلة</TabsTrigger>
                                        <TabsTrigger value="delete-trap">حذف الأسئلة</TabsTrigger>
                                    </TabsList>
                                     {renderTrapAnswerQuestions()}
                                     {renderTrapAnswerDelete()}
                               </Tabs>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="announcements">
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Megaphone /> لوحة الإعلانات</CardTitle>
                                <CardDescription>اكتب رسالة ستظهر في أعلى الصفحة الرئيسية لجميع اللاعبين.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Textarea
                                    value={announcementText}
                                    onChange={(e) => setAnnouncementText(e.target.value)}
                                    placeholder="اكتب إعلانك هنا..."
                                    rows={4}
                                />
                                <Button onClick={handleSaveAnnouncement} disabled={isSavingAnnouncement}>
                                    <Save className="mr-2 h-4 w-4" />
                                    {isSavingAnnouncement ? 'جاري الحفظ...' : 'حفظ الإعلان'}
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="animations">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Clapperboard /> تخصيص الرسوم المتحركة</CardTitle>
                                <CardDescription>استبدل الرسوم المتحركة الافتراضية بمقاطع فيديو من جهازك.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <h4 className="font-semibold">عقاب المحقق الفاشل</h4>
                                    <p className="text-sm text-muted-foreground mb-2">هذا الفيديو سيظهر عند فوز القاتل.</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                        <div className="space-y-2">
                                            <Label htmlFor="video-upload">ملف الفيديو (mp4, webm)</Label>
                                            <Input ref={videoInputRef} id="video-upload" type="file" accept="video/mp4,video/webm" onChange={handleVideoFileChange} />
                                            <Alert variant="destructive">
                                                <AlertTitle>تحذير</AlertTitle>
                                                <AlertDescription>الحد الأقصى لحجم الفيديو هو 750 كيلوبايت بسبب قيود قاعدة البيانات. الملفات الأكبر ستفشل في الحفظ.</AlertDescription>
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
                                <CardTitle className="flex items-center gap-2"><TestTube2 /> تجربة تحديات ساحة العباقرة</CardTitle>
                                <CardDescription>قم بتوليد وتجربة أي من التحديات بشكل فوري لأغراض الاختبار.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {GENIUS_CHALLENGES.map((challenge) => (
                                    <Button key={challenge.id} variant="outline" onClick={() => handleTestChallenge(challenge)}
                                        disabled={isGeneratingTest} className='h-auto py-3'>
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
                  <AlertDialogDescription>{getDialogDescription()}</AlertDialogDescription>
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
                            <ChallengeHost game={testGame} player={testGame.players[0]} self={testGame.players[0]} challenge={testingChallenge} />
                        )}
                    </div>
                </DialogContent>
            </Dialog>

             <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>تعديل بيانات: {editingUser?.name}</DialogTitle>
                        <DialogDescription>قم بتعديل رصيد الكوينز للمستخدم.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="coins" className="text-right">الكوينز</Label>
                            <Input id="coins" type="number" value={editingCoins} onChange={(e) => setEditingCoins(e.target.value)} className="col-span-3" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setEditingUser(null)}>إلغاء</Button>
                        <Button onClick={handleUpdateUser}>حفظ التغييرات</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    );

    