import { useState } from 'react';
import FocusFive from './focus-five.jsx';
import MaintenancePage from './MaintenancePage.jsx';

export default function App() {
  const [page, setPage] = useState('main');
  return page === 'main'
    ? <FocusFive onNavigate={setPage} />
    : <MaintenancePage onNavigate={setPage} />;
}
