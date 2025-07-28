

"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { uploadQuestionsFromJson, deleteQuestions, countQuestions, setFailedDetectiveAnimation, getFailedDetectiveAnimation, removeFailedDetectiveAnimation, uploadTrapAnswerQuestionsFromJson, deleteSimilarQuestions, getAnnouncement, setAnnouncement, searchUsers, adminUpdateUser, getTrapAnswerCategories, addTrapAnswerCategory, editTrapAnswerCategory, deleteTrapAnswerCategory, resetAllUserAvatars, uploadPrisonQuestionsFromJson, getLiveGameStats, kickPlayerFromAnyGame } from '@/lib/actions/admin';
import { generateTestChallenge, generateTestKillerGame, getLatestUsers, getMostFrequentUsers, sendMailToUser } from '@/app/actions';
import { Upload, ArrowLeft, Trash2, Clapperboard, TestTube2, Brain, Apple, Grape, Dices, Save, Puzzle, Loader2, Sparkles, Megaphone, Users, Search, CircleDollarSign, Edit, Store, PlusCircle, X, RefreshCw, Gavel, UserX, Wand, Eye, Clock, Send } from 'lucide-react';
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
import type { Game, UserProfile, Player } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { Textarea } from '@/components/ui/textarea';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { getSocialRankForUser } from '@/lib/actions/user';
import { KillerGame } from '@/components/game/killer/KillerGame';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';


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
    game: 'trap-answer' | 'prison'; 
    category?: string; 
    searchTerm?: string; 
    answerSearchTerm?: string; 
    all?: boolean; 
    duplicates?: { threshold: number };
};

type AlertType = 'deleteQuestions' | 'deleteCategory' | 'resetAvatars' | 'kickPlayer';

export default function AdminPage() {
    const { toast } = useToast();
    const router = useRouter();
    const { user, userProfile, loading, socialRanks: allSocialRanks } = useAuth();

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
    const [killerTestPlayerView, setKillerTestPlayerView] = useState<Player | null>(null);


    // States for Announcement
    const [announcementText, setAnnouncementText] = useState("");
    const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);

    // States for User Management
    const [userSearchTerm, setUserSearchTerm] = useState("");
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [searchedUsers, setSearchedUsers] = useState<UserProfile[]>([]);
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [editingCoins, setEditingCoins] = useState<string>("");
    const [isResettingAvatars, setIsResettingAvatars] = useState(false);
    const [alertType, setAlertType] = useState<AlertType | null>(null);

    // Mail states
    const [mailRecipient, setMailRecipient] = useState<UserProfile | null>(null);
    const [mailSubject, setMailSubject] = useState("");
    const [mailBody, setMailBody] = useState("");
    const [isSendingMail, setIsSendingMail] = useState(false);

    // States for User Activity
    const [latestVisitors, setLatestVisitors] = useState<UserProfile[]>([]);
    const [mostFrequentVisitors, setMostFrequentVisitors] = useState<UserProfile[]>([]);
    const [isActivityLoading, setIsActivityLoading] = useState(true);

    // State for Judge Powers
    const [judgeGameId, setJudgeGameId] = useState("");
    const [liveGameStats, setLiveGameStats] = useState<{ players: any[], gameState: string, round: number } | null>(null);
    const [isLoadingStats, setIsLoadingStats] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<{ id: string; name: string } | null>(null);


    // Debounce search
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!loading && !userProfile?.isAdmin) {
            router.push('/');
        }
    }, [userProfile, loading, router]);

    const fetchAdminData = useCallback(async () => {
        setIsActivityLoading(true);
        const [
            videoResult, 
            announcementResult, 
            categoriesResult, 
            latest, 
            mostFrequent
        ] = await Promise.all([
            getFailedDetectiveAnimation(),
            getAnnouncement(),
            getTrapAnswerCategories(),
            getLatestUsers(10),
            getMostFrequentUsers(10)
        ]);

        if (videoResult.success && videoResult.url) {
            setCurrentVideoUrl(videoResult.url);
        }
        
        if (announcementResult.success && announcementResult.text) {
            setAnnouncementText(announcementResult.text);
        }
        
        if (categoriesResult.success && categoriesResult.categories) {
            setTrapAnswerCategories(categoriesResult.categories.sort((a,b) => a.localeCompare(b)));
        }
        setLatestVisitors(latest);
        setMostFrequentVisitors(mostFrequent);
        setIsActivityLoading(false);

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
                setSelectedJsonFile(null);
                return;
            }
            setSelectedVideoFile(file);
        }
    };

    const handleQuestionUpload = async (gameType: 'trap-answer' | 'prison') => {
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
                } else { // prison game
                     const questions: { text: string }[] = Array.isArray(json) ? json : json.questions;
                     if (!Array.isArray(questions) || !questions.every(q => q && typeof q.text === 'string')) {
                         throw new Error('كل سؤال في لعبة "السجن" يجب أن يكون كائنًا يحتوي على مفتاح "text".');
                     }
                    result = await uploadPrisonQuestionsFromJson(questions);
                }

                if (result.success) {
                    toast({
                        title: 'نجاح',
                        description: `تم رفع ${result.count} سؤال بنجاح.`,
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
        setAlertType('deleteQuestions');
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
        if(deletionParams.duplicates && deletionParams.game === 'trap-answer') {
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
        setAlertType(null);
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

    const handleTestKillerGame = async () => {
        setIsGeneratingTest(true);
        try {
            const { game } = await generateTestKillerGame();
            if (game) {
                setTestGame(game);
                setKillerTestPlayerView(game.players[0]); // Start view with the first player
                setIsTestModalOpen(true);
            } else {
                throw new Error("Failed to create a test game.");
            }
        } catch (error: any) {
             toast({ title: "Error Generating Test", description: error.message || "Could not generate the killer test game.", variant: "destructive" });
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
        setAlertType(null);
        setIsDialogOpen(false);
    }

    const handleResetAvatars = async () => {
        setIsResettingAvatars(true);
        const result = await resetAllUserAvatars();
        if (result.success) {
            toast({ title: "نجاح!", description: `تم إعادة ضبط شخصيات ${result.count} لاعب.` });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsResettingAvatars(false);
        setAlertType(null);
        setIsDialogOpen(false);
    }

     const handleGetLiveStats = async () => {
        if (!judgeGameId.trim()) {
            toast({ title: "الرجاء إدخال معرف الغرفة", variant: "destructive" });
            return;
        }
        setIsLoadingStats(true);
        const result = await getLiveGameStats(judgeGameId.toUpperCase());
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
            setLiveGameStats(null);
        } else {
            setLiveGameStats(result.gameData);
        }
        setIsLoadingStats(false);
    };

    const handleKickPlayerFromGame = async () => {
        if (!playerToKick || !user) return;
        setIsActionLoading(true);
        const result = await kickPlayerFromAnyGame(judgeGameId.toUpperCase(), user.uid, playerToKick.id);
        if (result.success) {
            toast({ title: `تم طرد اللاعب ${playerToKick.name}` });
            handleGetLiveStats(); // Refresh stats after kicking
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsActionLoading(false);
        setAlertType(null);
        setIsDialogOpen(false);
    };

    const handleOpenMailDialog = (user: UserProfile) => {
        setMailRecipient(user);
        setMailSubject("");
        setMailBody("");
    };

    const handleSendMail = async () => {
        if (!mailRecipient || !mailSubject.trim() || !mailBody.trim() || !userProfile) {
            toast({ title: "خطأ", description: "الرجاء ملء جميع الحقول.", variant: "destructive" });
            return;
        }
        setIsSendingMail(true);
        const result = await sendMailToUser(userProfile.uid, mailRecipient.uid, mailSubject, mailBody);
        if (result.success) {
            toast({ title: "نجاح", description: `تم إرسال الرسالة إلى ${mailRecipient.name} بنجاح.` });
            setMailRecipient(null);
        } else {
            toast({ title: "فشل الإرسال", description: result.error, variant: "destructive" });
        }
        setIsSendingMail(false);
    };


    const openConfirmationDialog = (type: AlertType, player?: { id: string, name: string }) => {
        setAlertType(type);
        if (player) {
            setPlayerToKick(player);
        }
        setIsDialogOpen(true);
    };
    
    const getDialogDescription = () => {
        if (alertType === 'kickPlayer') {
            return `هل أنت متأكد من طرد اللاعب "${playerToKick?.name}" من اللعبة الحالية؟ لا يمكن التراجع عن هذا الإجراء.`
        }
        if (alertType === 'deleteCategory') {
             return `هل أنت متأكد من حذف قسم "${categoryToDelete}"؟ سيتم حذف جميع الأسئلة المرتبطة به بشكل دائم. لا يمكن التراجع عن هذا الإجراء.`;
        }
        if (alertType === 'resetAvatars') {
            return `هل أنت متأكد؟ هذا الإجراء سيعيد تعيين شخصية كل لاعب إلى الشخصية الافتراضية، وسيقوم بإزالة جميع الشخصيات التي قاموا بفتحها. لا يمكن التراجع عن هذا الإجراء.`
        }
        if (!deletionParams) return '';
        if (deletionParams.duplicates) {
            return `سيقوم هذا الإجراء بفحص جميع الأسئلة في قسم "${deletionParams.category}" وحذف الأسئلة المتشابهة بنسبة ${deletionParams.duplicates.threshold * 100}% أو أكثر، مع الإبقاء على النسخة الأحدث. سيتم حذف ${deletionCount} سؤال. هل أنت متأكد؟`;
        }
        if (deletionParams.all) {
             return `تحذير شديد! هذا الإجراء سيحذف جميع الأسئلة (${deletionCount}) من قاعدة البيانات بشكل دائم للعبة المحددة. لا يمكن التراجع عن هذا الإجراء.`;
        }
        return `هذا الإجراء لا يمكن التراجع عنه. سيتم حذف ${deletionCount} سؤال بشكل دائم بناءً على المعيار الذي حددته.`
    };

    const confirmAction = () => {
      switch (alertType) {
        case 'deleteCategory':
            handleConfirmCategoryDelete();
            break;
        case 'deleteQuestions':
            confirmDelete();
            break;
        case 'resetAvatars':
            handleResetAvatars();
            break;
        case 'kickPlayer':
            handleKickPlayerFromGame();
            break;
        default:
            break;
        }
    };
    
    if (loading) return null;
    if (!userProfile?.isAdmin) {
        return null;
    }

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
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => { setCategoryToDelete(cat); openConfirmationDialog('deleteCategory'); }} disabled={isActionLoading}>
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

    return (
        <main className="flex min-h-screen flex-col items-center p-4 bg-muted/40">
            <div className="w-full max-w-4xl space-y-8 py-8">
                <div className="text-center relative">
                    <h1 className="text-3xl font-bold">لوحة تحكم الأدمن</h1>
                    <p className="text-muted-foreground">إدارة محتوى اللعبة وإعداداتها.</p>
                    <div className="absolute top-0 right-0 flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href="/admin/store"><Store className="mr-2" /> إدارة المتجر والألقاب</Link>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                            <ArrowLeft />
                        </Button>
                    </div>
                </div>

                <Tabs defaultValue="users" className="w-full">
                    <TabsList className="grid w-full grid-cols-6">
                        <TabsTrigger value="users">المستخدمون</TabsTrigger>
                        <TabsTrigger value="questions">الأسئلة</TabsTrigger>
                        <TabsTrigger value="judge">صلاحيات القاضي</TabsTrigger>
                        <TabsTrigger value="announcements">الإعلانات</TabsTrigger>
                        <TabsTrigger value="animations">الرسوم</TabsTrigger>
                        <TabsTrigger value="testing">الاختبار</TabsTrigger>
                    </TabsList>

                     <TabsContent value="users">
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Users /> إدارة المستخدمين</CardTitle>
                                <CardDescription>ابحث عن مستخدم وقم بتعديل بياناته أو شاهد إحصائيات النشاط.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h3 className='font-bold text-lg'>البحث والتعديل</h3>
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
                                            const rank = getSocialRankForUser(user.leaderboardPoints || 0, allSocialRanks);
                                            const RankIcon = rank?.icon;
                                            return (
                                                <div key={user.uid} className="flex justify-between items-center p-2 bg-muted rounded-md">
                                                    <div className='flex items-center gap-2'>
                                                        <PlayerAvatar avatarId={user.avatarId || 'Avatar00.png'} className="w-10 h-10"/>
                                                        <div>
                                                            <p className='font-bold'>{user.name}</p>
                                                            {rank && RankIcon && (
                                                                <p className='text-xs text-muted-foreground font-semibold flex items-center gap-1.5'>
                                                                    <RankIcon className="w-3 h-3 text-amber-500" />
                                                                    {rank.name}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className='flex items-center gap-2'>
                                                        <CircleDollarSign className='text-yellow-500'/>
                                                        <span className='font-bold'>{user.coins}</span>
                                                        <Button size="icon" variant="ghost" onClick={() => handleOpenMailDialog(user)}>
                                                            <Send className="w-4 h-4" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" onClick={() => { setEditingUser(user); setEditingCoins(String(user.coins)); }}>
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                                 <div className="space-y-4">
                                     <h3 className='font-bold text-lg'>إحصائيات النشاط</h3>
                                     {isActivityLoading ? <div className='text-center'><Loader2 className='animate-spin'/></div> : (
                                         <div className='grid grid-cols-1 gap-4'>
                                             <div>
                                                 <h4 className='font-semibold mb-2 flex items-center gap-2'><Clock/> أحدث الزوار</h4>
                                                 <div className='space-y-2'>
                                                     {latestVisitors.map(u => (
                                                         <div key={u.uid} className='flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm'>
                                                             <div className='flex items-center gap-2'>
                                                                 <PlayerAvatar avatarId={u.avatarId} className="w-8 h-8"/>
                                                                 <span>{u.name}</span>
                                                             </div>
                                                             <span className='text-muted-foreground'>{u.lastVisited ? formatDistanceToNow(u.lastVisited, { addSuffix: true, locale: ar }) : 'غير معروف'}</span>
                                                         </div>
                                                     ))}
                                                 </div>
                                             </div>
                                             <div>
                                                 <h4 className='font-semibold mb-2 flex items-center gap-2'><Eye/> الأكثر زيارة</h4>
                                                 <div className='space-y-2'>
                                                     {mostFrequentVisitors.map(u => (
                                                          <div key={u.uid} className='flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm'>
                                                             <div className='flex items-center gap-2'>
                                                                 <PlayerAvatar avatarId={u.avatarId} className="w-8 h-8"/>
                                                                 <span>{u.name}</span>
                                                             </div>
                                                             <span className='font-bold text-primary'>{u.visitCount || 0} زيارة</span>
                                                         </div>
                                                     ))}
                                                 </div>
                                             </div>
                                         </div>
                                     )}
                                 </div>
                            </CardContent>
                            <CardFooter>
                                <Button variant="destructive" onClick={() => openConfirmationDialog('resetAvatars')} disabled={isResettingAvatars}>
                                    <RefreshCw className="mr-2" />
                                    {isResettingAvatars ? 'جاري العمل...' : 'إعادة ضبط شخصيات جميع اللاعبين'}
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="questions">
                        <Card>
                            <CardHeader>
                                <CardTitle>إدارة أسئلة الألعاب</CardTitle>
                                <CardDescription>رفع وحذف أسئلة الألعاب المختلفة.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs defaultValue="upload-trap" className="w-full">
                                    <TabsList className="grid w-full grid-cols-5">
                                        <TabsTrigger value="upload-trap">رفع (الجواب المفخخ)</TabsTrigger>
                                        <TabsTrigger value="upload-prison">رفع (السجن)</TabsTrigger>
                                        <TabsTrigger value="delete-trap">حذف (الجواب المفخخ)</TabsTrigger>
                                        <TabsTrigger value="delete-prison">حذف (السجن)</TabsTrigger>
                                        <TabsTrigger value="manage-categories">إدارة الأقسام</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="upload-trap" className="pt-4">{renderTrapAnswerQuestions()}</TabsContent>
                                    <TabsContent value="upload-prison" className="pt-4">{renderPrisonQuestions()}</TabsContent>
                                    <TabsContent value="delete-trap" className="pt-4">{renderTrapAnswerDelete()}</TabsContent>
                                    <TabsContent value="delete-prison" className="pt-4">{renderPrisonDelete()}</TabsContent>
                                    <TabsContent value="manage-categories" className="pt-4">{renderManageCategories()}</TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    </TabsContent>

                     <TabsContent value="judge">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Gavel/> صلاحيات القاضي</CardTitle>
                                <CardDescription>أدخل معرف غرفة لعبة "السجن" لعرض إحصائيات حية وطرد اللاعبين.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex gap-2">
                                    <Input 
                                        placeholder="أدخل معرف الغرفة..."
                                        value={judgeGameId}
                                        onChange={(e) => setJudgeGameId(e.target.value)}
                                        className="text-center"
                                    />
                                    <Button onClick={handleGetLiveStats} disabled={isLoadingStats}>
                                        {isLoadingStats ? <Loader2 className="animate-spin" /> : <Search />}
                                    </Button>
                                </div>
                                {liveGameStats && (
                                    <div className="space-y-3">
                                        <div className="flex justify-between text-sm text-muted-foreground">
                                            <span>الحالة: <strong className="text-primary">{liveGameStats.gameState}</strong></span>
                                            <span>الجولة: <strong className="text-primary">{liveGameStats.round}</strong></span>
                                        </div>
                                        <div className="space-y-2">
                                            {liveGameStats.players.map(p => (
                                                <div key={p.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                                                    <div className="flex items-center gap-2">
                                                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                                        <div>
                                                            <p className="font-bold">{p.name}</p>
                                                            <p className="text-xs text-muted-foreground">{p.activity}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-right">
                                                        <p>أعلى مزايدة: <span className="font-bold text-yellow-600">{p.currentBid}</span></p>
                                                        <p>في السجن لـ <span className="font-bold text-red-600">{p.roundsInPrison}</span> جولات</p>
                                                    </div>
                                                    <Button variant="destructive" size="icon" onClick={() => openConfirmationDialog('kickPlayer', p)} disabled={isActionLoading}>
                                                        <UserX className="h-4 w-4"/>
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
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
                                <CardTitle className="flex items-center gap-2"><TestTube2 /> ساحة الاختبار</CardTitle>
                                <CardDescription>قم بتوليد وتجربة الألعاب بشكل فوري لأغراض الاختبار.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className='flex items-center gap-2'><Wand /> لعبة المحقق والقاتل</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                         <Button className="w-full" onClick={handleTestKillerGame} disabled={isGeneratingTest}>
                                             {isGeneratingTest && !testingChallenge ? "جاري..." : "بدء اختبار لعبة المحقق"}
                                        </Button>
                                    </CardContent>
                                </Card>
                                 <Card>
                                    <CardHeader>
                                        <CardTitle className='flex items-center gap-2'><Brain /> ساحة العباقرة</CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-2 gap-2">
                                        {GENIUS_CHALLENGES.map((challenge) => (
                                            <Button key={challenge.id} variant="outline" onClick={() => handleTestChallenge(challenge)}
                                                disabled={isGeneratingTest} className='h-auto py-3 text-xs'>
                                                {isGeneratingTest && testingChallenge?.id === challenge.id ? "..." : `${challenge.name}`}
                                            </Button>
                                        ))}
                                    </CardContent>
                                </Card>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            <AlertDialog open={isDialogOpen} onOpenChange={(open) => { if(!open) { setIsDialogOpen(false); setAlertType(null); setCategoryToDelete(null); setPlayerToKick(null); }}}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                  <AlertDialogDescription>{getDialogDescription()}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => { setIsDialogOpen(false); setAlertType(null); setCategoryToDelete(null); setPlayerToKick(null); }}>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmAction} className={buttonVariants({ variant: "destructive" })} disabled={isDeleting || isActionLoading || isResettingAvatars}>
                    {(isDeleting || isActionLoading || isResettingAvatars) ? 'جاري العمل...' : 'نعم، قم بالتأكيد'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            <Dialog open={isTestModalOpen} onOpenChange={(isOpen) => { setIsTestModalOpen(isOpen); if (!isOpen) setTestGame(null); setTestingChallenge(null); }}>
                <DialogContent className="max-w-4xl bg-slate-50">
                    <DialogHeader>
                        <DialogTitle>اختبار: {testGame?.gameType === 'killer' ? "المحقق والقاتل" : testingChallenge?.name}</DialogTitle>
                         {testGame?.gameType === 'killer' && (
                            <div className='flex flex-wrap gap-2 pt-2'>
                                {testGame.players.map(p => (
                                    <Button key={p.id} size="sm" variant={killerTestPlayerView?.id === p.id ? "default" : "outline"} onClick={() => setKillerTestPlayerView(p)}>
                                        {p.name} ({p.role})
                                    </Button>
                                ))}
                            </div>
                         )}
                    </DialogHeader>
                    <div className="flex items-center justify-center p-4 min-h-[60vh] bg-slate-100 rounded-md">
                       {testGame?.gameType === 'king-of-genius' && testingChallenge && (
                            <ChallengeHost game={testGame} player={testGame.players[0]} self={testGame.players[0]} challenge={testingChallenge} />
                        )}
                        {testGame?.gameType === 'killer' && killerTestPlayerView && (
                            <KillerGame game={testGame} player={killerTestPlayerView} self={killerTestPlayerView} setGame={setTestGame} />
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
            
            {/* Mail Dialog */}
            <Dialog open={!!mailRecipient} onOpenChange={(open) => !open && setMailRecipient(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>إرسال رسالة إلى: {mailRecipient?.name}</DialogTitle>
                        <DialogDescription>ستظهر هذه الرسالة في صندوق البريد الخاص باللاعب داخل اللعبة.</DialogDescription>
                    </DialogHeader>
                     <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="mail-subject" className="text-right">الموضوع</Label>
                            <Input id="mail-subject" value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="mail-body" className="text-right">الرسالة</Label>
                            <Textarea id="mail-body" value={mailBody} onChange={(e) => setMailBody(e.target.value)} className="col-span-3" rows={5}/>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setMailRecipient(null)}>إلغاء</Button>
                        <Button onClick={handleSendMail} disabled={isSendingMail}>
                            {isSendingMail ? <Loader2 className="animate-spin" /> : <Send className="mr-2" />}
                            إرسال
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    );
}
