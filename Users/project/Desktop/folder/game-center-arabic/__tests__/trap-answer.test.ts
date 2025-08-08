
import { safeCompareStrings } from '@/lib/actions/trap-answer';

describe('Trap Answer Game Logic', () => {

    describe('safeCompareStrings', () => {

        // --- Basic Tests ---
        it('should return 1.0 for identical strings', () => {
            expect(safeCompareStrings('مرحباً بالعالم', 'مرحباً بالعالم')).toBe(1.0);
        });

        it('should return a low score for completely different strings', () => {
            expect(safeCompareStrings('تفاحة', 'برتقالة')).toBeLessThan(0.4);
        });

        it('should be case-insensitive for English characters', () => {
            expect(safeCompareStrings('Hello World', 'hello world')).toBe(1.0);
        });

        // --- Normalization Tests (Crucial for Arabic) ---
        it('should ignore common punctuation', () => {
            expect(safeCompareStrings('ما هي عاصمة مصر؟', 'ما هي عاصمة مصر')).toBe(1.0);
        });

        it('should normalize different forms of Alef (أ, إ, آ)', () => {
            expect(safeCompareStrings('أحمد', 'احمد')).toBe(1.0);
            expect(safeCompareStrings('إسلام', 'اسلام')).toBe(1.0);
        });

        it('should normalize Taa Marbuta (ة) and Haa (ه)', () => {
            expect(safeCompareStrings('مدرسة', 'مدرسه')).toBe(1.0);
        });

        it('should normalize Alef Maqsura (ى) and Yaa (ي)', () => {
            expect(safeCompareStrings('على', 'علي')).toBe(1.0);
        });

        it('should handle different Tanween forms', () => {
            expect(safeCompareStrings('كتابٌ', 'كتاب')).toBeGreaterThan(0.9);
            expect(safeCompareStrings('كتاباً', 'كتاب')).toBeGreaterThan(0.9);
            expect(safeCompareStrings('كتابٍ', 'كتاب')).toBeGreaterThan(0.9);
        });

        // --- Edge Case Tests ---
        it('should return 0 for empty or null strings', () => {
            expect(safeCompareStrings('', 'test')).toBe(0);
            expect(safeCompareStrings('test', '')).toBe(0);
            expect(safeCompareStrings('', '')).toBe(0);
        });

        it('should handle numeric strings correctly', () => {
            expect(safeCompareStrings('1995', '1995')).toBe(1.0);
            expect(safeCompareStrings('2023', '1445')).toBe(0.0);
        });

        it('should return 0 when comparing numeric with non-numeric strings', () => {
            expect(safeCompareStrings('12345', 'abcde')).toBe(0.0);
        });

        it('should handle strings with mixed numbers and text', () => {
            expect(safeCompareStrings('كأس العالم 1994', 'كأس العالم ١٩٩٤')).toBeGreaterThan(0.8);
        });
    });

    // We will add more tests here for other game logic functions in the future.
    // For example:
    // describe('score calculation', () => { ... });
    // describe('game state transitions', () => { ... });

});
