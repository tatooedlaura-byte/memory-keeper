export interface MediaAttachment {
  id: string;
  type: 'image' | 'audio' | 'video';
  url: string;
  fileName: string;
  storagePath: string;
}

export interface Memory {
  id: string;
  text: string;
  tags: string[];
  media: MediaAttachment[];
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

export interface MemoryInput {
  text: string;
  tags: string[];
  mediaFiles: File[];
}
