
'use server';

/**
 * @fileoverview Re-exports all admin actions from their specialized modules.
 * This acts as a single entry point for the admin UI components.
 */

export * from './ai';
export * from './content';
export * from './maintenance';
export * from './settings';
export * from './users';
export * from '../../actions/news'; // Re-export news actions here

    