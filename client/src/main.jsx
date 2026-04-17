import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import FocusFive from './focus-five.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FocusFive />
  </StrictMode>
);
