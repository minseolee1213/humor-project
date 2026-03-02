'use server';

import { revalidatePath } from 'next/cache';

/**
 * Server action to revalidate the home page after upload
 */
export async function revalidateHome() {
  revalidatePath('/');
}
