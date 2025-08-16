
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, UserPlus } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getDefaultAvatar } from "@/lib/actions/user/queries";

const formSchema = z.object({
  name: z.string().min(2, { message: "يجب أن يتكون الاسم من حرفين على الأقل." }),
  email: z.string().email({ message: "الرجاء إدخال بريد إلكتروني صالح." }),
  password: z.string().min(6, { message: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل." }),
  gender: z.enum(["male", "female"], {
    required_error: "الرجاء اختيار الجنس.",
  }),
});

export default function SignupPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
        },
    });

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true);
        try {
            // 1. Create user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
            const user = userCredential.user;

            // 2. Update Auth profile (optional but good practice)
            await updateProfile(user, { displayName: values.name });
            
            // 3. Create user profile document directly in Firestore from the client
            const { avatarId: defaultAvatar } = await getDefaultAvatar();
            const userDocRef = doc(db, "users", user.uid);
            await setDoc(userDocRef, {
                name: values.name.trim(),
                email: values.email,
                gender: values.gender,
                createdAt: serverTimestamp(),
                isAdmin: false,
                isEditor: false,
                coins: 5,
                diamonds: 0,
                avatarId: defaultAvatar || 'Avatar00.png',
                unlockedAvatars: [defaultAvatar || 'Avatar00.png'],
                unlockedPunishmentAvatars: [],
                leaderboardPoints: 0,
                honorPoints: 0,
                loyaltyPoints: 0,
                rebellionPoints: 0,
                trophies: 0,
                gamesPlayed: {},
                hasChangedName: false,
                leagues: [],
                winCounts: {},
                clan: null,
                clanRole: null,
                audienceGroups: [],
                humiliation: null,
                allegiance: null,
                allegianceRequests: [],
                taxDemands: [],
                alliances: [],
                decrees: [],
                duelChallenges: [],
                lastPunishmentTimestamp: {},
                originalAvatarToRevert: null,
                isPunished: false,
            });

            toast({ title: "تم إنشاء الحساب بنجاح!" });
            router.push("/");

        } catch (error: any) {
            let description = "حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.";
            if (error.code === 'auth/email-already-in-use') {
                description = "هذا البريد الإلكتروني مستخدم بالفعل.";
            } else if (error.code === 'auth/operation-not-allowed') {
                 description = "إنشاء الحسابات معطل. يرجى تفعيل 'Email/Password' كطريقة تسجيل دخول في لوحة تحكم Firebase.";
            } else if (error.message && error.message.includes('signup-are-blocked')) {
                description = "إنشاء حسابات جديدة معطل. يرجى تفعيل 'Identity Platform' في لوحة تحكم Google Cloud لمشروع Firebase الخاص بك.";
            } else if (error.message) {
                description = error.message;
            }
            toast({
                title: "خطأ في إنشاء الحساب",
                description,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/40">
            <Card className="w-full max-w-md">
                <CardHeader>
                     <CardTitle className="flex items-center justify-between">
                        <span>إنشاء حساب جديد</span>
                         <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                            <ArrowLeft />
                        </Button>
                    </CardTitle>
                    <CardDescription>
                        املأ النموذج أدناه للانضمام إلى اللعبة.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>الاسم</FormLabel>
                                        <FormControl>
                                            <Input placeholder="اسمك" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>البريد الإلكتروني</FormLabel>
                                        <FormControl>
                                            <Input placeholder="name@example.com" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>كلمة المرور</FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="********" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="gender"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                        <FormLabel>الجنس</FormLabel>
                                        <FormControl>
                                            <RadioGroup
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            className="flex items-center gap-4"
                                            >
                                                <FormItem className="flex items-center space-x-2 space-x-reverse">
                                                    <FormControl>
                                                    <RadioGroupItem value="male" id="male" />
                                                    </FormControl>
                                                    <FormLabel htmlFor="male" className="font-normal">
                                                    ذكر
                                                    </FormLabel>
                                                </FormItem>
                                                <FormItem className="flex items-center space-x-2 space-x-reverse">
                                                    <FormControl>
                                                    <RadioGroupItem value="female" id="female" />
                                                    </FormControl>
                                                    <FormLabel htmlFor="female" className="font-normal">
                                                    أنثى
                                                    </FormLabel>
                                                </FormItem>
                                            </RadioGroup>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                                />
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                <UserPlus className="mr-2"/>
                                {isLoading ? "جاري إنشاء الحساب..." : "إنشاء حساب"}
                            </Button>
                        </form>
                    </Form>
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                        لديك حساب بالفعل؟{" "}
                        <Link href="/login" className="underline text-primary">
                            سجل الدخول
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </main>
    );
}
