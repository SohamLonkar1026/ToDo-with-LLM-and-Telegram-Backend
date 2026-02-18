# Phase 2 — Web Dashboard Report

**Date:** 2026-02-15
**Status:** ✅ Implemented & Built

---

## 1. Project Overview
A Production-ready React dashboard initialized with Vite, TypeScript, and Tailwind CSS (Dark Mode).

### Installation Steps
1.  Navigate to frontend: `cd frontend`
2.  Install dependencies: `npm install`
3.  Start development server: `npm run dev`
4.  Build for production: `npm run build`

---

## 2. Folder Structure

```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── index.css
    ├── vite-env.d.ts
    ├── components/
    │   ├── layout/       # Sidebar, Topbar, Layout
    │   ├── ui/           # Button, Input, Card
    │   └── tasks/        # TaskCard, TaskModal
    ├── context/
    │   └── AuthContext.tsx
    ├── pages/            # Login, Register, Dashboard
    └── services/
        └── api.ts
```

---

## 3. Key Configuration & Core Files

### `tailwind.config.js`
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
        colors: {
            slate: {
                800: '#1e293b',
                900: '#0f172a',
            }
        }
    },
  },
  plugins: [],
}
```

### `src/services/api.ts`
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
    }
    return Promise.reject(error);
  }
);

export default api;
```

### `src/context/AuthContext.tsx`
```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  token: string | null;
  login: (token: string, email: string) => void;
  logout: () => void;
  userEmail: string | null;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [userEmail, setUserEmail] = useState<string | null>(localStorage.getItem('userEmail'));

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  useEffect(() => {
    if (userEmail) {
      localStorage.setItem('userEmail', userEmail);
    } else {
      localStorage.removeItem('userEmail');
    }
  }, [userEmail]);

  const login = (newToken: string, email: string) => {
    setToken(newToken);
    setUserEmail(email);
  };

  const logout = () => {
    setToken(null);
    setUserEmail(null);
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, userEmail, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

### `src/pages/Dashboard.tsx`
```typescript
import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import api from '../services/api';
import TaskCard, { Task } from '../components/tasks/TaskCard';
import TaskModal from '../components/tasks/TaskModal';
import Button from '../components/ui/Button';

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchTasks = async () => {
    try {
      const response = await api.get('/tasks');
      setTasks(response.data.data);
    } catch (error) {
      console.error('Failed to fetch tasks', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleComplete = async (id: string) => {
    try {
      const task = tasks.find(t => t.id === id);
      if (!task) return;
      
      const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
      setTasks(tasks.map(t => t.id === id ? { ...t, status: newStatus } : t));
      await api.put(`/tasks/${id}`, { status: newStatus });
    } catch (error) {
      console.error('Failed to update task', error);
      fetchTasks();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      setTasks(tasks.filter(t => t.id !== id));
      await api.delete(`/tasks/${id}`);
    } catch (error) {
      console.error('Failed to delete task', error);
      fetchTasks();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">My Tasks</h2>
        <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Task
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-12">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-slate-700/50 border-dashed">
          <p className="text-slate-400 mb-4">No tasks found.</p>
          <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
            Create your first task
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tasks.map((task) => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onComplete={handleComplete}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <TaskModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchTasks}
      />
    </div>
  );
}
```

---

## 4. Verification Check
- **Build:** `npm run build` ✅ PASSED
- **Dependencies:** React, Vite, Tailwind, Axios installed.
- **Scope:** Frontend Only (No backend changes).
- **Design:** Dark mode implemented per spec.

Ready for Phase 3!
