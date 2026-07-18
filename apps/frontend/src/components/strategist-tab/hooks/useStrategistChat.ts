import { useState, useRef } from 'react';
import { toast } from 'sonner';

export function useStrategistChat(
  handleFileUpload: (file: File) => Promise<void>,
  renameSession: (id: string, title: string) => Promise<void>
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      await handleFileUpload(file);
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingSessionId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = async (id: string) => {
    if (!editingTitle.trim()) {
      toast.error('Session title cannot be empty');
      return;
    }
    try {
      await renameSession(id, editingTitle.trim());
      setEditingSessionId(null);
    } catch {
      toast.error('Failed to rename session');
    }
  };

  return {
    fileInputRef,
    isUploading,
    editingSessionId,
    setEditingSessionId,
    editingTitle,
    setEditingTitle,
    triggerFileSelect,
    handleFileChange,
    handleStartRename,
    handleSaveRename,
  };
}
