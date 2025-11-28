/*
Simple sync server for AP Exam Center using Express + lowdb (JSON file storage).

Features:
- Persistent storage of courses, users, communityNotes, analytics
- Endpoints for fetching data, creating/editing notes, submitting ratings, basic signup/login (insecure, demo-only)
- CORS enabled so your front-end can call it from the browser during development

NOTES:
- This is a minimal demo. Do NOT use this as-is in production:
  - Passwords are stored in plaintext here for simplicity. Hash passwords (bcrypt) in production.
  - Add authentication (JWT or session) and proper authorization checks.
  - Sanitize/validate all inputs.
  - Rate-limit endpoints and secure the server.

Install:
  npm init -y
  npm install express lowdb cors nanoid

Run:
  node server.js
*/

const express = require('express');
const cors = require('cors');
const { Low, JSONFile } = require('lowdb');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Use JSON file for storage
const dbFile = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

async function initDb() {
  await db.read();
  db.data = db.data || {
    courses: [],
    users: [],
    communityNotes: [],
    analytics: { sessions: [] }
  };

  // Add default courses if empty (same examples as client)
  if (!db.data.courses || db.data.courses.length === 0) {
    db.data.courses = [
      { id: 'c1', title: 'AP Calculus AB', icon: '📊', description: 'Master differential and integral calculus', notes: '# AP Calculus AB\n\n## Key Concepts\n- Limits\n- Derivatives\n\n', links: [{ title: 'CollegeBoard', url: 'https://apstudents.collegeboard.org' }] },
      { id: 'c2', title: 'AP Physics 1', icon: '⚡', description: 'Mechanics & waves', notes: '# AP Physics 1\n\n## Topics\n- Kinematics\n- Dynamics', links: [] },
      { id: 'c3', title: 'AP Chemistry', icon: '🧪', description: 'Chemistry principles', notes: '# AP Chemistry\n\n...', links: [] }
    ];
    await db.write();
  }
}
initDb();

// Helper: save db
async function persist() {
  await db.write();
}

/*
Endpoints:
- GET /api/data
- POST /api/courses         -> create course (dev)
- PUT  /api/courses/:id     -> update course (dev)
- GET  /api/courses/:id     -> get course
- POST /api/notes           -> create community note (requires userId)
- PUT  /api/notes/:id       -> edit note (author or dev)
- DELETE /api/notes/:id     -> delete note (dev only)
- POST /api/notes/:id/rate  -> submit or update rating (requires userId)
- POST /api/auth/signup     -> create user (returns user object)
- POST /api/auth/login      -> login (insecure demo)
*/

// Return all data needed by client
app.get('/api/data', async (req, res) => {
  await db.read();
  const { courses, communityNotes, users, analytics } = db.data;
  res.json({ courses, communityNotes, users: users.map(u => ({ id: u.id, name: u.name, email: u.email })), analytics });
});

// Courses (dev)
app.post('/api/courses', async (req, res) => {
  const { title, icon, description, notes } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Missing title/description' });
  const course = { id: nanoid(), title, icon: icon || '📘', description, notes: notes || '', links: [] };
  await db.read();
  db.data.courses.push(course);
  await persist();
  res.json(course);
});

app.put('/api/courses/:id', async (req, res) => {
  const { id } = req.params;
  await db.read();
  const course = db.data.courses.find(c => c.id === id);
  if (!course) return res.status(404).json({ error: 'Not found' });
  Object.assign(course, req.body);
  await persist();
  res.json(course);
});

app.get('/api/courses/:id', async (req, res) => {
  await db.read();
  const course = db.data.courses.find(c => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'Not found' });
  res.json(course);
});

// Community notes
app.post('/api/notes', async (req, res) => {
  const { courseId, title, content, authorId } = req.body;
  if (!courseId || !title || !content || !authorId) return res.status(400).json({ error: 'Missing fields' });
  await db.read();
  const user = db.data.users.find(u => u.id === authorId);
  if (!user) return res.status(400).json({ error: 'Invalid author' });
  const note = {
    id: nanoid(),
    courseId,
    title,
    content,
    author: user.name,
    authorId,
    createdAt: new Date().toISOString(),
    downloads: 0,
    ratings: [],
    averageRating: 0
  };
  db.data.communityNotes.push(note);
  await persist();
  res.json(note);
});

app.put('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  const { content, title, authorId } = req.body;
  await db.read();
  const note = db.data.communityNotes.find(n => n.id === id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  // Basic permission: allow if same author OR a 'dev' flag passed (in production do real auth)
  if (note.authorId !== authorId && !req.body.forceDev) return res.status(403).json({ error: 'Not allowed' });
  if (title) note.title = title;
  if (content) note.content = content;
  await persist();
  res.json(note);
});

app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  // In production check auth/roles; here allow if forceDev flag true or if authorId matches
  const { authorId, forceDev } = req.body || {};
  await db.read();
  const note = db.data.communityNotes.find(n => n.id === id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  if (!forceDev && note.authorId !== authorId) return res.status(403).json({ error: 'Not allowed' });
  db.data.communityNotes = db.data.communityNotes.filter(n => n.id !== id);
  await persist();
  res.json({ success: true });
});

// Rating endpoint
app.post('/api/notes/:id/rate', async (req, res) => {
  const { id } = req.params;
  const { userId, rating } = req.body;
  if (!userId || !rating) return res.status(400).json({ error: 'Missing userId or rating' });
  await db.read();
  const note = db.data.communityNotes.find(n => n.id === id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  note.ratings = note.ratings || [];
  const existing = note.ratings.find(r => r.userId === userId);
  if (existing) existing.rating = rating; else note.ratings.push({ userId, rating });
  const total = note.ratings.reduce((s, r) => s + r.rating, 0);
  note.averageRating = total / note.ratings.length;
  await persist();
  res.json({ averageRating: note.averageRating, ratingsCount: note.ratings.length });
});

// Auth (demo)
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
  await db.read();
  if (db.data.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email exists' });
  const user = { id: nanoid(), email, password, name, createdAt: new Date().toISOString() };
  db.data.users.push(user);
  await persist();
  // In production you would return a token; here we return user object (demo)
  res.json({ id: user.id, email: user.email, name: user.name });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  await db.read();
  const user = db.data.users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  // Return minimal user (demo). In production return JWT or session.
  res.json({ id: user.id, email: user.email, name: user.name });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sync server running on http://localhost:${PORT}`);
});
