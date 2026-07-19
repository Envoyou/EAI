'use client';

import { fetchWithTimeout } from '@/lib/fetch-utils';

import { AlertCircle, CheckCircle2, LifeBuoy, Loader2, Mail, Send } from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const categories = [
  'Billing and credits',
  'Account access',
  'Editorial workflow',
  'CMS integration',
  'Privacy request',
  'Other',
] as const;

export function SupportForm() {
  const [submitting, setSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(categories[0]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') || ''),
      email: String(form.get('email') || ''),
      category: category,
      subject: String(form.get('subject') || ''),
      message: String(form.get('message') || ''),
      orderReference: String(form.get('orderReference') || ''),
      website: String(form.get('website') || ''),
    };

    try {
      const response = await fetchWithTimeout('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to create the support ticket.');

      if (data.ticketNumber) {
        setTicketNumber(String(data.ticketNumber));
        event.currentTarget.reset();
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Unable to create the support ticket.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (ticketNumber) {
    return (
      <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-7 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h2 className="mt-4 text-xl font-bold">Your support request was received</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Keep this ticket number for follow-up:
        </p>
        <p className="mt-3 font-mono text-2xl font-black text-emerald-600 dark:text-emerald-300">
          #{ticketNumber}
        </p>
        <Button
          type="button"
          variant="surface"
          onClick={() => setTicketNumber(null)}
          className="mt-6"
        >
          Create another request
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Name
          <Input
            variant="surface"
            name="name"
            autoComplete="name"
            className="mt-2 h-11"
            placeholder="Your name"
            required
            minLength={2}
            maxLength={100}
          />
        </label>
        <label className="text-sm font-semibold">
          Account email
          <Input
            variant="surface"
            name="email"
            type="email"
            autoComplete="email"
            className="mt-2 h-11"
            placeholder="you@company.com"
            required
            maxLength={254}
          />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Category
          <Select value={category} onValueChange={(value) => { if (value !== null) setCategory(value); }}>
            <SelectTrigger className="mt-2 h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="text-sm font-semibold">
          Order or invoice reference
          <Input
            variant="surface"
            name="orderReference"
            className="mt-2 h-11 font-mono"
            placeholder="Optional"
            maxLength={120}
          />
        </label>
      </div>

      <label className="block text-sm font-semibold">
        Subject
        <Input
          variant="surface"
          name="subject"
          className="mt-2 h-11"
          placeholder="Briefly describe the issue"
          required
          minLength={5}
          maxLength={150}
        />
      </label>

      <label className="block text-sm font-semibold">
        Details
        <Textarea
          variant="surface"
          name="message"
          className="mt-2 min-h-40 resize-y"
          placeholder="Tell us what happened, what you expected, and any relevant steps or error messages."
          required
          minLength={20}
          maxLength={5000}
        />
      </label>

      <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        Website
        <Input variant="surface" name="website" tabIndex={-1} autoComplete="off" />
      </label>

      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
        Do not include passwords, card numbers, PINs, API secrets, or one-time codes.
      </p>

      {error && (
        <div className="ui-alert ui-alert-danger text-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            {error}{' '}
            <a href="mailto:support@envoyou.com" className="font-semibold underline">
              Email support@envoyou.com
            </a>
          </div>
        </div>
      )}

      <Button
        type="submit"
        disabled={submitting}
        variant="primary"
        className="h-11 w-full"
      >
        {submitting
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Send className="h-4 w-4" />}
        Submit support request
      </Button>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <LifeBuoy className="h-3.5 w-3.5" />
          Tracked in Zoho Desk
        </span>
        <a href="mailto:support@envoyou.com" className="inline-flex items-center gap-1.5 hover:text-primary">
          <Mail className="h-3.5 w-3.5" />
          support@envoyou.com
        </a>
      </div>
    </form>
  );
}
