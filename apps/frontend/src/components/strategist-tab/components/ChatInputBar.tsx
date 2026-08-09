'use client';

import { useRef, useEffect } from 'react';
import {
  FileText,
  X,
  Paperclip,
  Globe,
  ArrowUp,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Attachment } from '@/lib/hooks/useContentStrategist';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileInput } from '@/components/ui/file-input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface ChatInputBarProps {
  chatInput: string;
  setChatInput: (v: string) => void;
  isTyping: boolean;
  uploadedAttachment: Attachment | null;
  setUploadedAttachment: (attachment: Attachment | null) => void;
  enableSearch: boolean;
  setEnableSearch: (v: boolean) => void;
  researchMode: 'fast' | 'deep';
  setResearchMode: (v: 'fast' | 'deep') => void;
  handleSend: (forcedText?: string) => void;
  onCancelChat?: () => void;
  triggerFileSelect: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  focusRequestId?: number;
}

export function ChatInputBar({
  chatInput,
  setChatInput,
  isTyping,
  uploadedAttachment,
  setUploadedAttachment,
  enableSearch,
  setEnableSearch,
  researchMode,
  setResearchMode,
  handleSend,
  onCancelChat,
  triggerFileSelect,
  fileInputRef,
  handleFileChange,
  focusRequestId = 0,
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [chatInput]);

  useEffect(() => {
    if (focusRequestId > 0) textareaRef.current?.focus();
  }, [focusRequestId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-3 py-2 border-t border-[var(--border)] shrink-0">
      {uploadedAttachment && (
        <Badge variant="surface" className="flex items-center gap-1.5 text-[10px] text-[var(--foreground)] mb-2 animate-fade-in py-1">
          <FileText className="w-3 h-3 text-[var(--primary)] shrink-0" />
          <span className="truncate max-w-[150px] font-medium">
            {uploadedAttachment.filename}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  onClick={() => setUploadedAttachment(null)}
                  variant="muted"
                  size="icon-xs"
                  className="strategist-attachment-remove ml-1"
                >
                  <X className="w-2.5 h-2.5" />
                </Button>
              }
            />
            <TooltipContent side="bottom" className="text-xs">
              Remove attachment
            </TooltipContent>
          </Tooltip>
        </Badge>
      )}
      <div className="flex flex-col bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-1.5 focus-within:ring-1 focus-within:ring-[var(--primary)]/30 focus-within:border-[var(--primary)]/30 transition-all">
        <FileInput
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,.csv,.txt"
          className="hidden"
        />

        <Textarea
          ref={textareaRef}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your article..."
          rows={1}
          disabled={isTyping}
          className="min-h-[44px] max-h-[120px] resize-none border-none bg-transparent px-2 py-1.5 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
        />

        <div className="flex items-center justify-between border-t border-[var(--border)]/20 pt-2 mt-1 px-1">
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    onClick={triggerFileSelect}
                    variant="muted"
                    size="icon"
                    className="strategist-composer-icon shrink-0"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="top" className="text-xs">
                Attach file (PDF, CSV, TXT)
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    onClick={() => setEnableSearch(!enableSearch)}
                    variant={enableSearch ? 'primary' : 'outline'}
                    size="icon"
                    aria-pressed={enableSearch}
                    className="rounded-full shrink-0"
                  >
                    <Globe className="w-3.5 h-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="top" className="text-xs">
                {enableSearch
                  ? 'Disable Web Search'
                  : 'Enable Web Search'}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1.5">
            <Select
              value={researchMode}
              onValueChange={(val) => {
                if (val) setResearchMode(val as 'fast' | 'deep');
              }}
            >
              <SelectTrigger
                size="sm"
                className="strategist-mode-select h-7 border border-[var(--border)] bg-transparent hover:bg-[var(--surface-3)] text-[var(--foreground)] hover:text-[var(--foreground)] text-[10px] font-semibold px-3 flex items-center gap-1 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[var(--border)] [&_svg]:max-md:hidden"
              >
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent
                side="top"
                sideOffset={8}
                className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-1 min-w-[130px] z-50"
              >
                <SelectItem
                  value="fast"
                  className="text-[10px] cursor-pointer rounded py-1.5 pl-2 pr-8 hover:bg-[var(--surface-2)]"
                >
                  Fast Mode
                </SelectItem>
                <SelectItem
                  value="deep"
                  className="text-[10px] cursor-pointer rounded py-1.5 pl-2 pr-8 hover:bg-[var(--surface-2)]"
                >
                  Deep Research
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              onClick={isTyping ? onCancelChat : () => handleSend()}
              disabled={
                !isTyping && !chatInput.trim() && !uploadedAttachment
              }
              variant={isTyping ? 'danger' : 'primary'}
              size="icon"
              className="rounded-full shrink-0 disabled:opacity-30"
              title={isTyping ? 'Cancel generation' : 'Send message'}
            >
              {isTyping ? (
                <Square className="w-3 h-3 fill-current" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
