
import { safeCompareStrings } from '@/lib/actions/helpers';

describe('safeCompareStrings', () => {
    
    // Test for identical strings
    it('should return 1.0 for identical strings', () => {
        expect(safeCompareStrings('hello world', 'hello world')).toBe(1.0);
    });

    // Test for completely different strings
    it('should return a low score for completely different strings', () => {
        expect(safeCompareStrings('apple', 'orange')).toBeLessThan(0.4);
    });

    // Test for strings with different casing
    it('should be case-insensitive', () => {
        expect(safeCompareStrings('Hello World', 'hello world')).toBe(1.0);
    });

    // Test for strings with different punctuation
    it('should ignore punctuation', () => {
        expect(safeCompareStrings('Hello, world!', 'Hello world')).toBe(1.0);
    });

    // Test for Arabic string similarity (Taa Marbuta)
    it('should handle Arabic character variations (Taa Marbuta)', () => {
        expect(safeCompareStrings('مدرسة', 'مدرسه')).toBe(1.0);
    });
    
    // Test for Arabic string similarity (Alef)
    it('should handle Arabic character variations (Alef)', () => {
        expect(safeCompareStrings('أحمد', 'احمد')).toBe(1.0);
    });
    
    // Test for minor typos
    it('should return a high score for strings with minor typos', () => {
        expect(safeCompareStrings('مرحبا', 'مرحباً')).toBeGreaterThan(0.8);
    });

    // Test for empty strings
    it('should return 0 for empty or null strings', () => {
        expect(safeCompareStrings('', 'test')).toBe(0);
        expect(safeCompareStrings('test', '')).toBe(0);
        expect(safeCompareStrings('', '')).toBe(0);
    });

    // Test for numeric strings
    it('should handle numeric strings correctly', () => {
        expect(safeCompareStrings('12345', '12345')).toBe(1.0);
        expect(safeCompareStrings('12345', '54321')).toBe(0.0);
        expect(safeCompareStrings('123.45', '123.45')).toBe(1.0);
    });
    
     // Test for comparing numeric with non-numeric
    it('should return 0 when comparing numeric with non-numeric strings', () => {
        expect(safeCompareStrings('12345', 'abcde')).toBe(0.0);
    });

});
