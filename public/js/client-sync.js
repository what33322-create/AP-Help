/* Client-side sync helpers to integrate the front-end with the server.

How to use:
1) Put this file somewhere your HTML can load (or inline the code near the end of your HTML).
2) Set SERVER_URL to the URL where server.js is running (e.g., 'http://localhost:3000').
3) Replace the local loadData/saveData and note/course/rating functions with calls to the functions below.
   - loadRemoteData() should be called on app startup to populate window.appData
   - createRemoteNote(), rateRemoteNote(), createRemoteCourse(), editRemoteCourse(), deleteRemoteNote() replace direct localStorage writes
4) Keep a local fallback to localStorage for offline mode if desired.

Important:
- This is a minimal integration example. Add authentication tokens (e.g., JWT) and attach them to headers for protected endpoints.
*/

const SERVER_URL = window.SERVER_URL || 'http://localhost:3000';

async function loadRemoteData() {
  try {
    const res = await fetch(`${SERVER_URL}/api/data`);
    if (!res.ok) throw new Error('Failed to fetch data');
    const data = await res.json();
    // Overwrite local appData with server copy
    window.appData = {
      courses: data.courses || [],
      communityNotes: data.communityNotes || [],
      users: data.users || [],
      analytics: data.analytics || { sessions: [] }
    };
    // persist locally as cache
    localStorage.setItem('apExamAppData', JSON.stringify(window.appData));
    return window.appData;
  } catch (err) {
    console.error('loadRemoteData error', err);
    // fallback to localStorage existing data
    const saved = localStorage.getItem('apExamAppData');
    if (saved) window.appData = JSON.parse(saved);
    return window.appData;
  }
}

async function createRemoteNote({ courseId, title, content, authorId }) {
  const payload = { courseId, title, content, authorId };
  const res = await fetch(`${SERVER_URL}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({ error: 'unknown' }));
    throw new Error(err.error || 'Failed to create note');
  }
  const note = await res.json();
  // merge into local state
  window.appData.communityNotes = window.appData.communityNotes || [];
  window.appData.communityNotes.push(note);
  localStorage.setItem('apExamAppData', JSON.stringify(window.appData));
  return note;
}

async function editRemoteNote(noteId, { content, title, authorId, forceDev=false }) {
  const res = await fetch(`${SERVER_URL}/api/notes/${encodeURIComponent(noteId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, title, authorId, forceDev })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({ error: 'unknown' }));
    throw new Error(err.error || 'Failed to edit note');
  }
  const note = await res.json();
  const idx = window.appData.communityNotes.findIndex(n => n.id === note.id);
  if (idx !== -1) window.appData.communityNotes[idx] = note;
  localStorage.setItem('apExamAppData', JSON.stringify(window.appData));
  return note;
}

async function deleteRemoteNote(noteId, { authorId, forceDev=false } = {}) {
  const res = await fetch(`${SERVER_URL}/api/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorId, forceDev })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({ error: 'unknown' }));
    throw new Error(err.error || 'Failed to delete note');
  }
  window.appData.communityNotes = (window.appData.communityNotes || []).filter(n => n.id !== noteId);
  localStorage.setItem('apExamAppData', JSON.stringify(window.appData));
  return true;
}

async function rateRemoteNote(noteId, userId, rating) {
  const res = await fetch(`${SERVER_URL}/api/notes/${encodeURIComponent(noteId)}/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, rating })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({ error: 'unknown' }));
    throw new Error(err.error || 'Failed to rate note');
  }
  const data = await res.json();
  // update local state
  const note = window.appData.communityNotes.find(n => n.id === noteId);
  if (note) {
    note.averageRating = data.averageRating;
    note.ratings = note.ratings || [];
    const existing = note.ratings.find(r => r.userId === userId);
    if (existing) existing.rating = rating; else note.ratings.push({ userId, rating });
  }
  localStorage.setItem('apExamAppData', JSON.stringify(window.appData));
  return data;
}

async function createRemoteCourse({ title, icon, description, notes }) {
  const res = await fetch(`${SERVER_URL}/api/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, icon, description, notes })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({ error: 'unknown' }));
    throw new Error(err.error || 'Failed to create course');
  }
  const course = await res.json();
  window.appData.courses = window.appData.courses || [];
  window.appData.courses.push(course);
  localStorage.setItem('apExamAppData', JSON.stringify(window.appData));
  return course;
}

async function editRemoteCourse(courseId, updates) {
  const res = await fetch(`${SERVER_URL}/api/courses/${encodeURIComponent(courseId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({ error: 'unknown' }));
    throw new Error(err.error || 'Failed to edit course');
  }
  const course = await res.json();
  const idx = window.appData.courses.findIndex(c => c.id === course.id);
  if (idx !== -1) window.appData.courses[idx] = course;
  localStorage.setItem('apExamAppData', JSON.stringify(window.appData));
  return course;
}

// Simple auth helpers (demo)
async function signupRemote({ name, email, password }) {
  const res = await fetch(`${SERVER_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({ error: 'unknown' }));
    throw new Error(err.error || 'Signup failed');
  }
  const user = await res.json();
  // you might return a token instead in a real app; here just return the user object
  return user;
}

async function loginRemote({ email, password }) {
  const res = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({ error: 'unknown' }));
    throw new Error(err.error || 'Login failed');
  }
  const user = await res.json();
  // store minimal user info locally
  window.currentUser = user;
  localStorage.setItem('currentUser', JSON.stringify(user));
  return user;
}

export {
  SERVER_URL,
  loadRemoteData,
  createRemoteNote,
  editRemoteNote,
  deleteRemoteNote,
  rateRemoteNote,
  createRemoteCourse,
  editRemoteCourse,
  signupRemote,
  loginRemote
};
