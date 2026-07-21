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
        variant={role === 'author' ? 'surface' : 'ghost'}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
          role === 'author'
            ? 'bg-white dark:bg-brand-900 text-brand-900 dark:text-white shadow-sm'
            : 'text-brand-500 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-200'
        }`}
      >
        <PenTool className="w-4 h-4" />
        Author Mode
      </Button>
      <Button
        type="button"
        onClick={() => onChange('editor')}
        variant={role === 'editor' ? 'surface' : 'ghost'}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
          role === 'editor'
            ? 'bg-white dark:bg-brand-900 text-brand-900 dark:text-white shadow-sm'
            : 'text-brand-500 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-200'
        }`}
      >
        <ShieldCheck className="w-4 h-4" />
        Editor Mode
      </Button>
      <Button
        type="button"
        onClick={() => onChange('seo')}
        variant={role === 'seo' ? 'surface' : 'ghost'}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
          role === 'seo'
            ? 'bg-white dark:bg-brand-900 text-brand-900 dark:text-white shadow-sm'
            : 'text-brand-500 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-200'
        }`}
      >
        <Search className="w-4 h-4" />
        SEO Mode
      </Button>
      <Button
        type="button"
        onClick={() => onChange('fact-checker')}
        variant={role === 'fact-checker' ? 'surface' : 'ghost'}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
          role === 'fact-checker'
            ? 'bg-white dark:bg-brand-900 text-brand-900 dark:text-white shadow-sm'
            : 'text-brand-500 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-200'
        }`}
      >
        <Scale className="w-4 h-4" />
        Fact-Checker
      </Button>
    </div>
  );
}
