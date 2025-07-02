
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { uploadQuestionsFromJson } from '@/app/actions';
import { Upload, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminPage() {
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const { toast } = useToast();
    const router = useRouter();
    const { userProfile, loading } = useAuth();

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
        <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/40">
            <Card className="w-full max-w-lg">
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
        </main>
    );
}
