import { redirect } from 'next/navigation';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Redirect /deck to home page (/)
export default async function DeckPage() {
  redirect('/');
}
