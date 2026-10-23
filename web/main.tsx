import {AppErrorBoundary} from './components/app-error-boundary';
import {createRoot} from 'react-dom/client';
import {JobRadarDashboard} from './components/jobradar-dashboard';
import './app/globals.css';

createRoot(document.getElementById('root')!).render(<AppErrorBoundary><JobRadarDashboard/></AppErrorBoundary>);
