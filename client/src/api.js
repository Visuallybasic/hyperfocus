const json = (res) => {
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
};

const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

const put = (url, body) =>
  fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

export const api = {
  getAll: () => fetch('/api/tasks').then(json),
  getStats: () => fetch('/api/stats').then(json),

  addTask: (task) => post('/api/tasks', task),
  updateTask: (task) => put(`/api/tasks/${task.id}`, task),
  deleteTask: (id) => fetch(`/api/tasks/${id}`, { method: 'DELETE' }).then(json),

  completeTask: (id) => post(`/api/tasks/${id}/complete`, {}),
  blockTask: (id, blockerTitle) => post(`/api/tasks/${id}/block`, { blockerTitle }),
  dismissBadge: (id) => put(`/api/tasks/${id}/dismiss-badge`, {}),

  saveConfig: (config) => put('/api/config', config),
  saveThreshold: (threshold) => put('/api/config/threshold', { threshold }),
  testReminder: () => post('/api/remind', { force: true }),
};
