
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, LogIn } from "lucide-react";

const formSchema = z.object({
  email: z.string().email({ message: "الرجاء إدخال بريد إلكتروني صالح." }),
  password: z.string().min(1, { message: "كلمة المرور مطلوبة." }),
});

export default function LoginPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true);
        try {
            await signInWithEmailAndPassword(auth, values.email, values.password);
            toast({ title: "تم تسجيل الدخول بنجاح!" });
            router.push("/");
        } catch (error: any) {
            let description = "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
             if (error.code === 'auth/invalid-credential') {
                description = "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
            } else if (error.message) {
                description = error.message;
            }
            toast({
                title: "خطأ في تسجيل الدخول",
                description,
                variant: "destructive",
            });
            setIsLoading(false);
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/40">
            <Card className="w-full max-w-md">
                <CardHeader>
                     <CardTitle className="flex items-center justify-between">
                        <span>تسجيل الدخول</span>
                         <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                            <ArrowLeft />
                        </Button>
                    </CardTitle>
                    <CardDescription>
                        مرحبًا بعودتك! أدخل بياناتك للمتابعة.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                <LogIn className="mr-2"/>
                                {isLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
                            </Button>
                        </form>
                    </Form>
                     <p className="mt-4 text-center text-sm text-muted-foreground">
                        ليس لديك حساب؟{" "}
                        <Link href="/signup" className="underline text-primary">
                            أنشئ حسابًا جديدًا
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </main>
    );
}
