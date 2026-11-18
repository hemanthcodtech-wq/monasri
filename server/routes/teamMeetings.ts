import { Router, Request, Response } from 'express';
import db from '../db/connection.js';
import { emitSocketEvent } from '../services/socketService.js';
import { sendPushNotification } from '../services/notificationService.js';

const router = Router();

/**
 * Helper to determine employee's squad/group
 */
function getUserSquad(user: any): string | null {
  if (!user) return null;
  const empId = user.employeeId || user.id;
  const empCode = user.empCode || '';
  const empName = user.name || '';

  const memberRow = db.prepare(`
    SELECT groupName FROM team_members 
    WHERE id = ? OR empCode = ? OR LOWER(name) = LOWER(?)
    LIMIT 1
  `).get(empId, empCode, empName) as any;

  if (memberRow?.groupName) return memberRow.groupName;

  if (user.role === 'team_leader') {
    const groupRow = db.prepare(`
      SELECT name FROM team_groups 
      WHERE LOWER(leaderName) = LOWER(?)
      LIMIT 1
    `).get(empName) as any;
    if (groupRow?.name) return groupRow.name;
  }

  return null;
}

// GET /api/team-meetings
// Audience scoped to avoid any cross-meeting collisions
router.get('/', (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const role = user.role === 'employee' ? 'telecaller' : user.role;
    const userSquad = getUserSquad(user);
    const empId = user.employeeId || user.id;
    const empCode = user.empCode || '';
    const empName = (user.name || '').trim().toLowerCase();

    // 1. Admin: Sees all meetings across the entire firm, or meetings with includeAdmin = 1
    if (role === 'admin') {
      const meetings = db.prepare('SELECT * FROM team_meetings ORDER BY createdAt DESC').all();
      return res.status(200).json(meetings);
    }

    // 2. HR: Sees company townhalls, HR sessions, leadership syncs, all 1-on-1s they host or are invited to
    if (role === 'hr') {
      const meetings = db.prepare(`
        SELECT * FROM team_meetings 
        WHERE hostRole = 'hr'
           OR hostEmpCode = ?
           OR targetAudience IS NULL
           OR UPPER(targetAudience) IN ('ALL', 'ALL_HR', 'LEADERSHIP')
           OR targetEmployeeId IN (?, ?, ?)
           OR (? != '' AND LOWER(invitedMemberName) LIKE '%' || LOWER(?) || '%')
        ORDER BY createdAt DESC
      `).all(
        empCode,
        String(user.employeeId || ''),
        String(user.id || ''),
        empCode,
        empName,
        empName
      );
      return res.status(200).json(meetings);
    }

    // 3. Team Leader: Sees meetings they host, squad meetings for their squad, company-wide meetings, leadership syncs, and 1-on-1s for them
    if (role === 'team_leader') {
      const meetings = db.prepare(`
        SELECT * FROM team_meetings 
        WHERE (hostRole = 'team_leader' AND (hostEmpCode = ? OR LOWER(hostName) = LOWER(?)))
           OR targetAudience IS NULL
           OR UPPER(targetAudience) IN ('ALL', 'ALL_TL', 'LEADERSHIP')
           OR (targetTeam IS NOT NULL AND ? != '' AND LOWER(targetTeam) = LOWER(?))
           OR targetEmployeeId IN (?, ?, ?)
           OR (? != '' AND LOWER(invitedMemberName) LIKE '%' || LOWER(?) || '%')
        ORDER BY createdAt DESC
      `).all(
        empCode,
        empName,
        userSquad || '',
        userSquad || '',
        String(user.employeeId || ''),
        String(user.id || ''),
        empCode,
        empName,
        empName
      );
      return res.status(200).json(meetings);
    }

    // 4. Telecaller / Employee: Strict join-only scope.
    const meetings = db.prepare(`
      SELECT * FROM team_meetings 
      WHERE targetAudience IS NULL
         OR UPPER(targetAudience) IN ('ALL', 'ALL_TELECALLER')
         OR (targetTeam IS NOT NULL AND ? != '' AND LOWER(targetTeam) = LOWER(?))
         OR targetEmployeeId IN (?, ?, ?)
         OR (? != '' AND LOWER(invitedMemberName) LIKE '%' || LOWER(?) || '%')
      ORDER BY createdAt DESC
    `).all(
      userSquad || '',
      userSquad || '',
      String(user.employeeId || ''),
      String(user.id || ''),
      empCode,
      empName,
      empName
    );

    return res.status(200).json(meetings);
  } catch (error) {
    console.error('[GET /team-meetings] Error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/team-meetings/create-zoom
// Meeting creation endpoint (internal video room)
router.post('/create-zoom', async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const role = user.role === 'employee' ? 'telecaller' : user.role;

    if (role === 'telecaller') {
      return res.status(403).json({ error: 'Telecallers cannot host meetings. You may only join meetings when invited.' });
    }

    const {
      title,
      dateTime,
      type = 'Team Discussion',
      status = 'UPCOMING',
      targetAudience = 'ALL',
      targetTeam,
      targetEmployeeId,
      invitedMemberName,
      includeAdmin = false,
      priority = 'NORMAL',
      attendeesCount,
    } = req.body;

    const userSquad = getUserSquad(user);

    if (role === 'team_leader') {
      if (targetAudience === 'ALL' || targetAudience === 'ALL_HR') {
        return res.status(403).json({ error: 'Team Leaders can only schedule meetings for their own squad or squad 1-on-1s.' });
      }
    }

    const meetingId = `mtg-${Date.now()}`;
    const resolvedLocation = 'Mona Sri Video Room';
    const resolvedLink = `/room/${meetingId}`;

    db.prepare(`
      INSERT INTO team_meetings (
        id, title, dateTime, type, location, attendeesCount, agenda, status, 
        meetingLink, invitedMemberName, hostRole, hostName, hostEmpCode, targetAudience, 
        targetTeam, targetEmployeeId, includeAdmin, priority
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meetingId,
      title || 'Team Meeting',
      dateTime || 'Today, 11:00 AM',
      type,
      resolvedLocation,
      attendeesCount ? Number(attendeesCount) : 6,
      req.body.agenda || '',
      status || 'UPCOMING',
      resolvedLink,
      invitedMemberName || null,
      role,
      user.name,
      user.empCode || null,
      targetAudience,
      targetTeam || (role === 'team_leader' ? userSquad : null),
      targetEmployeeId || null,
      includeAdmin ? 1 : 0,
      priority
    );

    const created = db.prepare('SELECT * FROM team_meetings WHERE id = ?').get(meetingId) as any;
    emitSocketEvent('meeting:created', created);

    if (created) {
      sendPushNotification({
        title: 'Team Meeting Scheduled 📅',
        body: `${created.title || 'Meeting'} scheduled for ${created.dateTime || 'today'}.`,
        data: { targetTab: 'home', meetingId }
      }).catch(() => {});
    }

    return res.status(201).json(created);
  } catch (error) {
    console.error('[POST /team-meetings] Error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/team-meetings (Standard endpoint)
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const role = user.role === 'employee' ? 'telecaller' : user.role;

    if (role === 'telecaller') {
      return res.status(403).json({ error: 'Telecallers cannot create meetings.' });
    }

    const { 
      id, 
      title, 
      dateTime, 
      type, 
      location, 
      attendeesCount, 
      agenda, 
      status, 
      meetingLink, 
      invitedMemberName,
      targetAudience = 'ALL',
      targetTeam,
      targetEmployeeId,
      includeAdmin = false,
      priority = 'NORMAL',
    } = req.body;

    const meetingId = id || `mtg-${Date.now()}`;
    const userSquad = getUserSquad(user);

    const finalLink = meetingLink || `/room/${meetingId}`;
    const finalLocation = location || 'Mona Sri Video Room';

    db.prepare(`
      INSERT INTO team_meetings (
        id, title, dateTime, type, location, attendeesCount, agenda, status, 
        meetingLink, invitedMemberName, zoomMeetingId, zoomJoinUrl, zoomStartUrl, 
        zoomPassword, hostRole, hostName, hostEmpCode, targetAudience, 
        targetTeam, targetEmployeeId, includeAdmin, priority
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meetingId,
      title || 'Team Meeting',
      dateTime || 'Today',
      type || 'Team Discussion',
      finalLocation,
      attendeesCount ? Number(attendeesCount) : 6,
      agenda || '',
      status || 'UPCOMING',
      finalLink,
      invitedMemberName || null,
      null,
      finalLink,
      finalLink,
      null,
      role,
      user.name,
      user.empCode || null,
      targetAudience,
      targetTeam || (role === 'team_leader' ? userSquad : null),
      targetEmployeeId || null,
      includeAdmin ? 1 : 0,
      priority
    );

    const created = db.prepare('SELECT * FROM team_meetings WHERE id = ?').get(meetingId) as any;
    emitSocketEvent('meeting:created', created);

    if (created) {
      sendPushNotification({
        title: 'Team Meeting Scheduled 📅',
        body: `${created.title || 'Meeting'} scheduled for ${created.time || 'today'}.`,
        data: { targetTab: 'home', meetingId }
      }).catch(() => {});
    }

    return res.status(201).json(created);
  } catch (error) {
    console.error('[POST /team-meetings] Error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

// PUT /api/team-meetings/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const role = user.role === 'employee' ? 'telecaller' : user.role;
    if (role === 'telecaller') {
      return res.status(403).json({ error: 'Forbidden: Telecallers cannot modify meetings' });
    }

    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM team_meetings WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const isHost = Boolean(
      (existing.hostEmpCode && user.empCode && existing.hostEmpCode.toLowerCase() === user.empCode.toLowerCase()) ||
      (existing.hostName && user.name && existing.hostName.toLowerCase() === user.name.toLowerCase())
    );

    if (role !== 'admin' && !isHost) {
      // If non-host is trying to change meeting metadata, block it
      if (req.body.title && req.body.title !== existing.title) {
        return res.status(403).json({ error: 'Forbidden: Only the meeting host or Admin can modify meeting details' });
      }
    }

    const merged = { ...existing, ...req.body };
    db.prepare(`
      UPDATE team_meetings 
      SET title = ?, dateTime = ?, type = ?, location = ?, attendeesCount = ?, 
          agenda = ?, status = ?, meetingLink = ?, invitedMemberName = ?,
          zoomMeetingId = ?, zoomJoinUrl = ?, zoomStartUrl = ?, zoomPassword = ?,
          targetAudience = ?, targetTeam = ?, targetEmployeeId = ?, 
          includeAdmin = ?, priority = ?
      WHERE id = ?
    `).run(
      merged.title, merged.dateTime, merged.type, merged.location,
      merged.attendeesCount, merged.agenda, merged.status, merged.meetingLink, merged.invitedMemberName,
      merged.zoomMeetingId || null, merged.zoomJoinUrl || null, merged.zoomStartUrl || null, merged.zoomPassword || null,
      merged.targetAudience || 'ALL', merged.targetTeam || null, merged.targetEmployeeId || null,
      merged.includeAdmin ? 1 : 0, merged.priority || 'NORMAL',
      id
    );

    const updated = db.prepare('SELECT * FROM team_meetings WHERE id = ?').get(id);
    return res.status(200).json(updated);
  } catch (error) {
    console.error('[PUT /team-meetings/:id] Error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

// DELETE /api/team-meetings/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const role = user.role === 'employee' ? 'telecaller' : user.role;
    if (role === 'telecaller') {
      return res.status(403).json({ error: 'Forbidden: Telecallers cannot delete meetings' });
    }

    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM team_meetings WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const isHost = Boolean(
      (existing.hostEmpCode && user.empCode && existing.hostEmpCode.toLowerCase() === user.empCode.toLowerCase()) ||
      (existing.hostName && user.name && existing.hostName.toLowerCase() === user.name.toLowerCase())
    );

    if (role !== 'admin' && !isHost) {
      return res.status(403).json({ error: 'Forbidden: Only the meeting host or Admin can cancel/delete this meeting' });
    }

    db.prepare('DELETE FROM team_meetings WHERE id = ?').run(id);
    emitSocketEvent('meeting:deleted', { id });
    return res.status(200).json({ success: true, message: 'Meeting deleted successfully' });
  } catch (error) {
    console.error('[DELETE /team-meetings/:id] Error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

export default router;

