import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import { DashboardPage } from './pages/DashboardPage';
import { NewScanPage } from './pages/NewScanPage';
import { ScanDetailsPage } from './pages/ScanDetailsPage';
import { ScanHistoryPage } from './pages/ScanHistoryPage';
import { ScanComparisonPage } from './pages/ScanComparisonPage';
import { ReportsPage } from './pages/ReportsPage';
import { SourcesPage } from './pages/SourcesPage';
import { AboutPage } from './pages/AboutPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="scans/new" element={<NewScanPage />} />
              <Route path="scans/:id" element={<ScanDetailsPage />} />
              <Route path="history" element={<ScanHistoryPage />} />
              <Route path="compare" element={<ScanComparisonPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="sources" element={<SourcesPage />} />
              <Route path="about" element={<AboutPage />} />
              {/* Surface bad links instead of silently redirecting home. */}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
