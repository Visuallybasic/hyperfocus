const base = import.meta.env.PROD ? '' : '';

const json = (res) => {
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
};

export const api = {
  getAll: () => fetch(`${base}/api/tasks`).then(json),

  addTask: (task) =>
    fetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    }).then(json),

  updateTask: (task) =>
    fetch(`${base}/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    }).then(json),

  deleteTask: (id) =>
    fetch(`${base}/api/tasks/${id}`, { method: 'DELETE' }).then(json),

  saveConfig: (config) =>
    fetch(`${base}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).then(json),

  testReminder: () =>
    fetch(`${base}/api/remind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    }).then(json),
};
