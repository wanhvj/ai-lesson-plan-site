import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import TeacherToolbox from './TeacherToolbox.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TeacherToolbox />
  </StrictMode>,
)
