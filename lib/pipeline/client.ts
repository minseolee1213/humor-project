/**
 * Pipeline API Client
 * Handles image upload and caption generation via the staging REST API
 * Base URL: https://api.almostcrackd.ai
 */

const PIPELINE_BASE_URL = 'https://api.almostcrackd.ai';

export interface PresignedUrlResponse {
  presignedUrl: string;
  cdnUrl: string;
}

export interface UploadImageResponse {
  imageId: string;
  now: string;
}

export interface Caption {
  id: string;
  content: string | null;
  image_id: string | null;
  profile_id: string | null;
  created_datetime_utc: string;
  modified_datetime_utc: string | null;
  is_public: boolean;
  is_featured: boolean;
  like_count: number;
  humor_flavor_id: number | null;
  caption_request_id: number | null;
  llm_prompt_chain_id: number | null;
}

/**
 * Get authorization token from Supabase session
 */
async function getAuthToken(): Promise<string> {
  const { createClient } = await import('@/lib/supabase/client');
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  
  if (error || !data.session?.access_token) {
    throw new Error('Authentication required. Please sign in.');
  }
  
  return data.session.access_token;
}

/**
 * Step 1: Generate presigned upload URL
 */
export async function generatePresignedUrl(contentType: string): Promise<PresignedUrlResponse> {
  const token = await getAuthToken();
  
  const response = await fetch(`${PIPELINE_BASE_URL}/pipeline/generate-presigned-url`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contentType }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to generate presigned URL: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Step 2: Upload image bytes to presigned URL (S3)
 */
export async function uploadToS3(presignedUrl: string, file: File): Promise<void> {
  const response = await fetch(presignedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload to S3: ${response.status} ${errorText}`);
  }
}

/**
 * Step 3: Register uploaded image URL
 */
export async function registerImage(cdnUrl: string, isCommonUse: boolean = false): Promise<UploadImageResponse> {
  const token = await getAuthToken();
  
  const response = await fetch(`${PIPELINE_BASE_URL}/pipeline/upload-image-from-url`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrl: cdnUrl, isCommonUse }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to register image: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Step 4: Generate captions for an image
 */
export async function generateCaptions(imageId: string): Promise<Caption[]> {
  const token = await getAuthToken();
  
  const response = await fetch(`${PIPELINE_BASE_URL}/pipeline/generate-captions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to generate captions: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Validate file type
 */
export function isValidImageType(file: File): boolean {
  const validTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
  ];
  
  return validTypes.includes(file.type.toLowerCase());
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
