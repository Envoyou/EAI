import { Router, Request } from 'express';
import { Webhook } from 'svix';
import { prisma } from '@/lib/db';
import { normalizeEmail, isDisposableEmail } from '@eai/shared';

const router = Router();

import type { WebhookEvent } from '@clerk/backend';

router.post('/', async (req: Request & { rawBody?: Buffer }, res) => {
  const SIGNING_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!SIGNING_SECRET) {
    console.error('Missing CLERK_WEBHOOK_SECRET in environment variables.');
    return res.status(500).send('Server configuration error');
  }

  // Get the headers
  const svix_id = req.headers['svix-id'] as string;
  const svix_timestamp = req.headers['svix-timestamp'] as string;
  const svix_signature = req.headers['svix-signature'] as string;

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).send('Error occurred -- no svix headers');
  }

  // Use rawBody buffer string if available to ensure correct signature verification
  const body = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(SIGNING_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return res.status(400).send('Error occurred during verification');
  }

  const eventType = evt.type;

  if (eventType === 'organization.created' || eventType === 'organization.updated') {
    const { id, name, slug, created_by } = evt.data;

    if (!id || !name) {
      return res.status(400).send('Error -- Missing organization payload');
    }

    const fallbackSlug = id.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const normalizedSlug = (slug || fallbackSlug).toLowerCase();
    const existingSlugOwner = await prisma.organization.findUnique({
      where: { slug: normalizedSlug },
      select: { clerkOrganizationId: true },
    });
    const localSlug = existingSlugOwner && existingSlugOwner.clerkOrganizationId !== id
      ? `${normalizedSlug}-${id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-8)}`
      : normalizedSlug;

    await prisma.organization.upsert({
      where: { clerkOrganizationId: id },
      update: {
        name,
        slug: localSlug,
        ...(created_by ? { createdByUserId: created_by } : {}),
        isActive: true,
      },
      create: {
        clerkOrganizationId: id,
        createdByUserId: created_by || null,
        name,
        slug: localSlug,
        publicationName: name,
        onboardingStatus: 'pending',
      },
    });

    return res.send('Organization synced successfully');
  }

  if (eventType === 'organization.deleted') {
    const { id } = evt.data;

    if (!id) {
      return res.status(400).send('Error -- Missing organization ID');
    }

    await prisma.organization.updateMany({
      where: { clerkOrganizationId: id },
      data: { isActive: false },
    });

    return res.send('Organization deactivated successfully');
  }

  if (eventType === 'user.created' || eventType === 'user.updated') {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;
    
    if (!id) {
      return res.status(400).send('Error -- Missing user ID');
    }

    const email = email_addresses?.[0]?.email_address;
    if (!email) {
      return res.status(400).send('Error -- Missing user email');
    }

    const name = [first_name, last_name].filter(Boolean).join(' ');

    let shouldDenyTrial = false;

    if (eventType === 'user.created') {
      if (isDisposableEmail(email)) {
        console.warn(`[Sybil Prevention] User signup with disposable email denied trial credits: ${email}`);
        shouldDenyTrial = true;
      } else {
        const normalizedSignUpEmail = normalizeEmail(email);
        const [localPart, domain] = email.trim().toLowerCase().split('@');
        
        if (localPart && domain) {
          const basePrefix = localPart.replace(/[^a-z0-9]/g, '').slice(0, 3);
          const candidates = await prisma.user.findMany({
            where: {
              email: {
                startsWith: basePrefix || undefined,
                endsWith: `@${domain}`,
              },
            },
            select: {
              email: true,
              trialUsed: true,
            },
          });

          const hasExistingTrial = candidates.some(
            (c) => c.trialUsed && normalizeEmail(c.email) === normalizedSignUpEmail
          );

          if (hasExistingTrial) {
            console.warn(`[Sybil Prevention] Duplicate signup detected for normalized email: ${normalizedSignUpEmail} (original: ${email}). Trial credits denied.`);
            shouldDenyTrial = true;
          }
        }
      }
    }

    await prisma.user.upsert({
      where: { id },
      update: {
        email,
        name: name || null,
        imageUrl: image_url || null,
        ...(shouldDenyTrial ? { trialUsed: true } : {}),
      },
      create: {
        id,
        email,
        name: name || null,
        imageUrl: image_url || null,
        trialUsed: shouldDenyTrial,
      },
    });

    return res.send('User synced successfully');
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data;

    if (!id) {
      return res.status(400).send('Error -- Missing user ID');
    }

    try {
      await prisma.user.delete({
        where: { id },
      });
    } catch (err) {
      console.warn(`Attempted to delete user ${id} but it was not found or could not be deleted:`, err);
    }

    return res.send('User deleted successfully');
  }

  return res.send('Unhandled webhook event');
});

export default router;
