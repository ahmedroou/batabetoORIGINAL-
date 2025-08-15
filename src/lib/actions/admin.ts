

'use server';

/**
 * @fileoverview This file has been refactored. Its contents are now split into multiple files
 * inside the /src/lib/actions/admin/ directory for better organization and maintainability.
 * This file is now empty and can be removed in the future if all imports are updated.
 * For now, it can serve as a placeholder or be deleted.
 */

// All functionality has been moved to the following files:
// - /src/lib/actions/admin/content.ts (for question/word management)
// - /src/lib/actions/admin/users.ts (for user search, updates, mail, etc.)
// - /src/lib/actions/admin/settings.ts (for game settings like categories, ranks, prices)
// - /src/lib/actions/admin/maintenance.ts (for maintenance tasks like recalculating kings)
// - /src/lib/actions/admin/ai.ts (for AI-related admin actions)

// A new index file at /src/lib/actions/admin/index.ts re-exports all functions.
// This allows for cleaner imports, e.g., `import { searchUsers } from '@/lib/actions/admin';`

export {};

