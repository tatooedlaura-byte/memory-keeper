import { useState, useRef } from 'react';
import { format } from 'date-fns';
import type { Memory, MediaAttachment } from '../types/Memory';
import './MemoryCard.css';

interface MemoryCardProps {
  memory: Memory;
  onUpdate: (id: string, updates: { text?: string; tags?: string[] }, newFiles?: File[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRemoveMedia: (memoryId: string, mediaId: string) => Promise<void>;
}

export function MemoryCard({ memory, onUpdate, onDelete, onRemoveMedia }: MemoryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(memory.text);
  const [editTags, setEditTags] = useState(memory.tags.join(', '));
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedMedia, setExpandedMedia] = useState<MediaAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    const tags = editTags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    await onUpdate(memory.id, { text: editText, tags }, newFiles.length > 0 ? newFiles : undefined);
    setNewFiles([]);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(memory.text);
    setEditTags(memory.tags.join(', '));
    setNewFiles([]);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(memory.id);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setNewFiles([...newFiles, ...Array.from(e.target.files)]);
    }
  };

  const removeNewFile = (index: number) => {
    setNewFiles(newFiles.filter((_, i) => i !== index));
  };

  const renderMedia = (media: MediaAttachment) => {
    switch (media.type) {
      case 'image':
        return (
          <div key={media.id} className="media-item" onClick={() => setExpandedMedia(media)}>
            <img src={media.url} alt={media.fileName} loading="lazy" />
            {isEditing && (
              <button
                className="remove-media"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveMedia(memory.id, media.id);
                }}
              >
                x
              </button>
            )}
          </div>
        );
      case 'audio':
        return (
          <div key={media.id} className="media-item audio-item">
            <audio controls src={media.url} />
            <span className="media-filename">{media.fileName}</span>
            {isEditing && (
              <button
                className="remove-media"
                onClick={() => onRemoveMedia(memory.id, media.id)}
              >
                x
              </button>
            )}
          </div>
        );
      case 'video':
        return (
          <div key={media.id} className="media-item video-item" onClick={() => setExpandedMedia(media)}>
            <video src={media.url} />
            <div className="video-play-icon">Play</div>
            {isEditing && (
              <button
                className="remove-media"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveMedia(memory.id, media.id);
                }}
              >
                x
              </button>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <article className="memory-card">
        <div className="memory-header">
          <time className="memory-date">
            {format(memory.createdAt, 'MMMM d, yyyy')}
          </time>
          <div className="memory-actions">
            {!isEditing ? (
              <>
                <button className="btn-icon" onClick={() => setIsEditing(true)} title="Edit">
                  Edit
                </button>
                <button
                  className="btn-icon delete"
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Delete"
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button className="btn-icon save" onClick={handleSave}>
                  Save
                </button>
                <button className="btn-icon" onClick={handleCancel}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {isEditing ? (
          <textarea
            className="memory-edit-text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
          />
        ) : (
          <p className="memory-text">{memory.text}</p>
        )}

        {memory.media.length > 0 && (
          <div className="memory-media">
            {memory.media.map(renderMedia)}
          </div>
        )}

        {isEditing && (
          <div className="add-media-section">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,audio/*,video/*"
              multiple
              hidden
            />
            <button
              className="add-media-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              + Add Media
            </button>
            {newFiles.length > 0 && (
              <div className="new-files-preview">
                {newFiles.map((file, index) => (
                  <div key={index} className="new-file-item">
                    <span>{file.name}</span>
                    <button onClick={() => removeNewFile(index)}>x</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isEditing ? (
          <div className="memory-tags-edit">
            <input
              type="text"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="Tags (comma-separated)"
            />
          </div>
        ) : (
          memory.tags.length > 0 && (
            <div className="memory-tags">
              {memory.tags.map((tag, index) => (
                <span key={index} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          )
        )}
      </article>

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Memory?</h3>
            <p>This memory and all its attachments will be permanently deleted.</p>
            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn-delete"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {expandedMedia && (
        <div className="modal-overlay" onClick={() => setExpandedMedia(null)}>
          <div className="media-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setExpandedMedia(null)}>
              x
            </button>
            {expandedMedia.type === 'image' ? (
              <img src={expandedMedia.url} alt={expandedMedia.fileName} />
            ) : (
              <video src={expandedMedia.url} controls autoPlay />
            )}
          </div>
        </div>
      )}
    </>
  );
}
