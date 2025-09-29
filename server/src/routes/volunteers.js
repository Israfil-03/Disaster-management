import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import {
  createVolunteerApplication,
  getApprovedVolunteers,
  getPendingApplications,
  updateVolunteerStatus,
  getApplicationById,
  markVolunteerNotificationSent,
} from '../models/volunteers.js';
import { ensureVolunteerTables } from '../lib/db.js';
import { sendVolunteerNotification } from '../services/notifications.js';

ensureVolunteerTables().catch((error) => {
  console.error('Failed to ensure volunteer tables:', error.message);
});

const router = express.Router();

const jwtSecret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;

const applicationSchema = z.object({
  fullName: z.string().min(2, 'Name is required').max(120),
  email: z.string().email('Valid email required'),
  phone: z.string().trim().min(6, 'Valid contact number required').max(32).optional().or(z.literal('')),
  skills: z.array(z.string()).nonempty('Select at least one skill'),
  availability: z.string().min(2, 'Availability is required').max(120),
  preferredLocation: z.string().max(160).optional().or(z.literal('')),
  motivation: z.string().max(1000).optional().or(z.literal('')),
});

const statusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'under_review', 'processed']),
  reviewerName: z.string().min(2).max(120).optional(),
  notes: z.string().max(2000).optional(),
});

function determineRoleFromEmail(email = '') {
  const e = String(email || '').toLowerCase();
  const domain = e.split('@')[1] || '';
  if (!domain) return 'citizen';
  if (domain === 'ndrf.gov.in' || /(^|\.)ndrf\.gov\.in$/.test(domain)) return 'ndrf';
  if (/\.gov\.in$/.test(domain) || /\.nic\.in$/.test(domain) || /\.gov$/.test(domain) || domain === 'gov.in') return 'authority';
  if (/\.org$/.test(domain) || /\.ngo$/.test(domain) || /(^|\.)ngo(\.|$)/.test(domain)) return 'ngo';
  return 'citizen';
}

function extractBearerToken(header = '') {
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function resolveRole(payload) {
  const metaRole = payload?.app_metadata?.role || payload?.user_metadata?.role;
  if (metaRole) return String(metaRole).toLowerCase();
  return determineRoleFromEmail(payload?.email);
}

function requireAuth(req, res, next) {
  const token = extractBearerToken(req.headers.authorization || '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!jwtSecret) {
    console.error('SUPABASE_JWT_SECRET is not configured.');
    return res.status(503).json({ error: 'Auth verification not configured on server.' });
  }
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = {
      token,
      payload,
      email: payload.email,
      role: resolveRole(payload),
      name: payload.user_metadata?.full_name || payload.user_metadata?.name || payload.email,
    };
    next();
  } catch (error) {
    console.error('Failed to verify Supabase token:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    const role = req.user?.role;
    if (!['authority', 'ndrf'].includes(role)) {
      return res.status(403).json({ error: 'Admin privileges required.' });
    }
    next();
  });
}

router.post('/apply', async (req, res) => {
  const parsed = applicationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  try {
    const data = parsed.data;
    const application = await createVolunteerApplication({
      ...data,
      phone: data.phone || null,
      preferredLocation: data.preferredLocation || null,
      motivation: data.motivation || null,
    });

    const message = `Hi ${application.fullName},\n\nThank you for volunteering with AadhyaPath. Our coordination team will review your application and reach out shortly.\n\nSkills: ${application.skills.join(', ')}\nAvailability: ${application.availability}\n\nYou can reach us anytime by replying to this email.\n\n— AadhyaPath Coordination`;

    await sendVolunteerNotification({
      to: application.email,
      subject: 'AadhyaPath — Volunteer Application Received',
      text: message,
      html: message.replace(/\n/g, '<br>'),
    });

    res.json({
      application: {
        id: application.id,
        status: application.status,
        createdAt: application.createdAt,
      },
      message: 'Application submitted successfully.',
    });
  } catch (error) {
    console.error('Failed to store volunteer application:', error.message);
    res.status(500).json({ error: 'Unable to store application at this time.' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const volunteers = await getApprovedVolunteers();
    res.json({ volunteers });
  } catch (error) {
    console.error('Failed to load volunteers:', error.message);
    res.status(500).json({ error: 'Unable to load volunteers.' });
  }
});

router.get('/applications', requireAdmin, async (_req, res) => {
  try {
    const applications = await getPendingApplications();
    res.json({ applications });
  } catch (error) {
    console.error('Failed to load volunteer applications:', error.message);
    res.status(500).json({ error: 'Unable to load applications.' });
  }
});

router.patch('/:id/status', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid application id.' });
  }
  const parsed = statusSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid status payload.', details: parsed.error.flatten() });
  }

  try {
    const payload = parsed.data;
    const reviewer = payload.reviewerName || req.user?.name || req.user?.email || 'Admin';
    const updated = await updateVolunteerStatus({
      id,
      status: payload.status,
      reviewerName: reviewer,
      notes: payload.notes,
    });
    if (!updated) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    if (payload.status === 'approved') {
      const subject = 'AadhyaPath — Volunteer Application Approved';
      const bodyLines = [
        `Hi ${updated.fullName},`,
        '',
        'Congratulations! Your volunteer application has been approved. Our coordination team will reach out with next steps shortly.',
        '',
        `Skills: ${updated.skills.join(', ')}`,
        `Availability: ${updated.availability}`,
      ];
      if (payload.notes) {
        bodyLines.push('', `Note from reviewer: ${payload.notes}`);
      }
      bodyLines.push('', '— AadhyaPath Coordination');
      const text = bodyLines.join('\n');
      const notifyResult = await sendVolunteerNotification({
        to: updated.email,
        subject,
        text,
        html: text.replace(/\n/g, '<br>'),
      });

      if (notifyResult.sent) {
        await markVolunteerNotificationSent(id);
        // Transition to processed status after sending notification
        await updateVolunteerStatus({ id, status: 'processed', reviewerName: reviewer });
      }
    } else if (payload.status === 'rejected') {
      const subject = 'AadhyaPath — Volunteer Application Update';
      const bodyLines = [
        `Hi ${updated.fullName},`,
        '',
        'Thank you for offering your support. At this time we are unable to onboard you but will retain your details for future requirements.',
        '',
        `Skills: ${updated.skills.join(', ')}`,
        `Availability: ${updated.availability}`,
      ];
      if (payload.notes) {
        bodyLines.push('', `Note from reviewer: ${payload.notes}`);
      }
      bodyLines.push('', '— AadhyaPath Coordination');
      const text = bodyLines.join('\n');
      const notifyResult = await sendVolunteerNotification({
        to: updated.email,
        subject,
        text,
        html: text.replace(/\n/g, '<br>'),
      });
      if (notifyResult.sent) {
        await markVolunteerNotificationSent(id);
      }
    }

    const sanitized = await getApplicationById(id);
    res.json({ application: sanitized });
  } catch (error) {
    console.error('Failed to update volunteer status:', error.message);
    res.status(500).json({ error: 'Unable to update status.' });
  }
});

export default router;
