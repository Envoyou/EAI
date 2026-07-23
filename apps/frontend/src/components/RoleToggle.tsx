import { Role } from '@eai/shared';
import { PenTool, ShieldCheck, Search, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RoleToggleProps {
  role: Role;
  onChange: (role: Role) => void;
}

export default function RoleToggle({ role, onChange }: RoleToggleProps) {
  return (
    <div className="flex bg-brand-100 dark:bg-brand-800 p-1 rounded-lg w-fit">
      <Button
        type="button"
        onClick={() => onChange('author')}
        variant={role === 'author' ? 'surface' : 'muted'}
        className="role-toggle-option flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all"
        data-active={role === 'author'}
        aria-pressed={role === 'author'}
      >
        <PenTool className="w-4 h-4" />
        Author Mode
      </Button>
      <Button
        type="button"
        onClick={() => onChange('editor')}
        variant={role === 'editor' ? 'surface' : 'muted'}
        className="role-toggle-option flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all"
        data-active={role === 'editor'}
        aria-pressed={role === 'editor'}
      >
        <ShieldCheck className="w-4 h-4" />
        Editor Mode
      </Button>
      <Button
        type="button"
        onClick={() => onChange('seo')}
        variant={role === 'seo' ? 'surface' : 'muted'}
        className="role-toggle-option flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all"
        data-active={role === 'seo'}
        aria-pressed={role === 'seo'}
      >
        <Search className="w-4 h-4" />
        SEO Mode
      </Button>
      <Button
        type="button"
        onClick={() => onChange('fact-checker')}
        variant={role === 'fact-checker' ? 'surface' : 'muted'}
        className="role-toggle-option flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all"
        data-active={role === 'fact-checker'}
        aria-pressed={role === 'fact-checker'}
      >
        <Scale className="w-4 h-4" />
        Fact-Checker
      </Button>
    </div>
  );
}
