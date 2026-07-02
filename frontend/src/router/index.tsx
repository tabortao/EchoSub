import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import Albums from '@/pages/Albums'
import Tags from '@/pages/Tags'
import Records from '@/pages/Records'
import Settings from '@/pages/Settings'
import Player from '@/pages/Player'
import Upload from '@/pages/Upload'
import StudyNotes from '@/pages/StudyNotes'
import { useAuthStore } from '@/store/auth'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

const routes: RouteObject[] = [
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: 'albums', element: <Albums /> },
      { path: 'tags', element: <Tags /> },
      { path: 'upload', element: <Upload /> },
      { path: 'notes', element: <StudyNotes /> },
      { path: 'records', element: <Records /> },
      { path: 'settings', element: <Settings /> },
      { path: 'play/:id', element: <Player /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter(routes)
