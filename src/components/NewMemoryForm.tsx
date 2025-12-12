import { useState, useRef } from 'react';
import type { MemoryInput } from '../types/Memory';
import './NewMemoryForm.css';

interface NewMemoryFormProps {
  onSubmit: (input: MemoryInput) => Promise<void>;
}

export function NewMemoryForm({ onSubmit }: NewMemoryFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles([...files, ...newFiles]);

      // Create previews for images
      const newPreviews = newFiles
        .filter(f => f.type.startsWith('image/'))
        .map(file => ({
          file,
          url: URL.createObjectURL(file)
        }));
      setPreviews([...previews, ...newPreviews]);
    }
  };

  const removeFile = (index: number) => {
    const file = files[index];
    const preview = previews.find(p => p.file === file);
    if (preview) {
      URL.revokeObjectURL(preview.url);
      setPreviews(previews.filter(p => p.file !== file));
    }
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    try {
      const tagList = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      await onSubmit({
        text: text.trim(),
        tags: tagList,
        mediaFiles: files
      });

      // Reset form
      setText('');
      setTags('');
      setFiles([]);
      previews.forEach(p => URL.revokeObjectURL(p.url));
      setPreviews([]);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to save memory:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('audio/')) return 'Audio';
    if (file.type.startsWith('video/')) return 'Video';
    return 'File';
  };

  if (!isOpen) {
    return (
      <button className="new-memory-button" onClick={() => setIsOpen(true)}>
        + New Memory
      </button>
    );
  }

  return (
    <div className="new-memory-form-container">
      <form onSubmit={handleSubmit} className="new-memory-form">
        <div className="form-header">
          <h2>Capture a Memory</h2>
          <button
            type="button"
            className="close-btn"
            onClick={() => setIsOpen(false)}
          >
            x
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your memory here... What happened? How did it feel? Who was there?"
          rows={5}
          disabled={isSubmitting}
          autoFocus
        />

        <div className="media-upload-section">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,audio/*,video/*"
            multiple
            hidden
          />
          <button
            type="button"
            className="upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
          >
            Attach Photo, Audio, or Video
          </button>

          {files.length > 0 && (
            <div className="file-previews">
              {files.map((file, index) => {
                const preview = previews.find(p => p.file === file);
                return (
                  <div key={index} className="file-preview">
                    {preview ? (
                      <img src={preview.url} alt={file.name} />
                    ) : (
                      <div className="file-icon">{getFileIcon(file)}</div>
                    )}
                    <span className="file-name">{file.name}</span>
                    <button
                      type="button"
                      className="remove-file"
                      onClick={() => removeFile(index)}
                    >
                      x
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags (comma-separated): family, summer, trip"
          disabled={isSubmitting}
        />

        <div className="form-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={() => setIsOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="save-btn"
            disabled={!text.trim() || isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save Memory'}
          </button>
        </div>
      </form>
    </div>
  );
}
