import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import Albums from '@/pages/Albums'
import Tags from '@/pages/Tags'
import Records from '@/pages/Records'
import Settings from '@/pages/Settings'
import DictionarySettings from '@/pages/DictionarySettings'
import About from '@/pages/About'
import Player from '@/pages/Player'
import SentenceDetail from '@/pages/SentenceDetail'
import Upload from '@/pages/Upload'
import StudyNotes from '@/pages/StudyNotes'
import NoteEditorPage from '@/pages/NoteEditor'
import Favorites from '@/pages/Favorites'
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
      { path: 'notes/:id', element: <NoteEditorPage /> },
      { path: 'records', element: <Records /> },
      { path: 'settings', element: <Settings /> },
      { path: 'settings/dictionary', element: <DictionarySettings /> },
      { path: 'about', element: <About /> },
      { path: 'favorites', element: <Favorites /> },
      { path: 'play/:id', element: <Player /> },
      { path: 'play/:id/sentence/:idx', element: <SentenceDetail /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter(routes)
