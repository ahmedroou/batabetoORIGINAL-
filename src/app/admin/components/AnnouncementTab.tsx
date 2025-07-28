
"use client";

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Megaphone, Save } from 'lucide-react';
import { getAnnouncement, setAnnouncement } from '@/lib/actions/admin';

export default function AnnouncementTab() {
    const { toast } = useToast();
    const [announcementText, setAnnouncementText] = useState("");
    const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);

    useEffect(() => {
        const fetchAnnouncement = async () => {
            const announcementResult = await getAnnouncement();
            if (announcementResult.success && announcementResult.text) {
                setAnnouncementText(announcementResult.text);
            }
        };
        fetchAnnouncement();
    }, []);

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

    return (
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
    );
}
