import { pool } from '../lib/db.js';

const columns = `id, full_name, email, phone, skills, availability, preferred_location, motivation, status, created_at, updated_at, reviewed_at, reviewed_by, notification_sent_at, notes`;

function mapRow(row = {}) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    skills: Array.isArray(row.skills) ? row.skills : [],
    availability: row.availability,
    preferredLocation: row.preferred_location,
    motivation: row.motivation,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    notificationSentAt: row.notification_sent_at,
    notes: row.notes,
  };
}

function toPublicVolunteer(row) {
  const mapped = mapRow(row);
  if (!mapped) return null;
  return {
    id: mapped.id,
    name: mapped.fullName,
    skills: mapped.skills,
    availability: mapped.availability,
    preferredLocation: mapped.preferredLocation,
    status: mapped.status,
    createdAt: mapped.createdAt,
  };
}

export async function createVolunteerApplication({
  fullName,
  email,
  phone,
  skills,
  availability,
  preferredLocation,
  motivation,
}) {
  const skillList = Array.isArray(skills)
    ? skills.map((s) => s.trim()).filter((s) => s.length > 0)
    : [];

  const { rows } = await pool.query(
    `INSERT INTO volunteer_applications
      (full_name, email, phone, skills, availability, preferred_location, motivation)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${columns}`,
    [
      fullName,
      email,
      phone || null,
      skillList,
      availability,
      preferredLocation || null,
      motivation || null,
    ],
  );
  return mapRow(rows[0]);
}

export async function getApprovedVolunteers() {
  const { rows } = await pool.query(
    `SELECT ${columns}
       FROM volunteer_applications
      WHERE status IN ('approved', 'processed')
      ORDER BY COALESCE(reviewed_at, updated_at) DESC, created_at DESC
      LIMIT 200`,
  );
  return rows.map(toPublicVolunteer).filter(Boolean);
}

export async function getPendingApplications() {
  const { rows } = await pool.query(
    `SELECT ${columns}
       FROM volunteer_applications
      WHERE status IN ('pending', 'under_review')
      ORDER BY created_at ASC
      LIMIT 200`,
  );
  return rows.map(mapRow).filter(Boolean);
}

export async function getApplicationById(id) {
  const { rows } = await pool.query(
    `SELECT ${columns}
       FROM volunteer_applications
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  return mapRow(rows[0]);
}

export async function updateVolunteerStatus({ id, status, reviewerName, notes }) {
  const { rows } = await pool.query(
    `UPDATE volunteer_applications
        SET status = $2,
            reviewed_by = COALESCE($3, reviewed_by),
            notes = COALESCE($4, notes),
            reviewed_at = CASE WHEN $2 IN ('approved', 'rejected') THEN NOW() ELSE reviewed_at END,
            updated_at = NOW()
      WHERE id = $1
      RETURNING ${columns}`,
    [id, status, reviewerName || null, notes || null],
  );
  return mapRow(rows[0]);
}

export async function markVolunteerNotificationSent(id) {
  await pool.query(
    `UPDATE volunteer_applications
        SET notification_sent_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [id],
  );
}
