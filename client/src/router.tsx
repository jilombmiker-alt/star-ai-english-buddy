/**
 * Magic English Buddy - 路由配置
 */

import { createBrowserRouter, Navigate, useRouteError } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Loading } from '@/components/common/Loading';

// 懒加载页面组件
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
const CompanionHomePage = lazy(() => import('@/pages/CompanionHomePage'));
const MapPage = lazy(() => import('@/pages/MapPage'));
const ReaderPage = lazy(() => import('@/pages/ReaderPage'));
const QuizPage = lazy(() => import('@/pages/QuizPage'));
const ScrollPage = lazy(() => import('@/pages/ScrollPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

// 加载组件包装器
const PageLoader = ({ children }: { children: React.ReactNode }) => (
  <Suspense
    fallback={
      <Loading fullscreen message="加载中..." />
    }
  >
    {children}
  </Suspense>
);

const RouteErrorPage = () => {
  const error = useRouteError();
  const isChunkRefresh = error instanceof Error && /dynamically imported module|loading chunk/i.test(error.message);
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, color: '#2e2850', background: 'linear-gradient(145deg,#fff9dd,#eee8ff)' }}>
      <section style={{ width: 'min(520px,100%)', padding: 28, textAlign: 'center', background: 'white', border: '3px solid rgba(255,255,255,.8)', borderRadius: 28, boxShadow: '0 9px 0 #7059d4,0 24px 45px rgba(60,44,110,.2)' }}>
        <div style={{ width: 72, height: 72, display: 'grid', placeItems: 'center', margin: '0 auto 18px', color: '#382c54', background: 'linear-gradient(145deg,#fff09b,#ffabd0)', borderRadius: 22, fontSize: 34 }}>★</div>
        <h1 style={{ margin: '0 0 10px', fontSize: 26 }}>{isChunkRefresh ? '星星更新好啦' : '星星刚才迷路了'}</h1>
        <p style={{ margin: '0 0 20px', color: '#686077', lineHeight: 1.7 }}>{isChunkRefresh ? '本地页面刚刚更新过，重新进入就能继续。' : '这一步没有打开成功。重新进入后，星星会继续陪你。'}</p>
        <button type="button" onClick={() => window.location.reload()} style={{ minWidth: 210, minHeight: 52, color: '#2d2442', background: 'linear-gradient(145deg,#ffef91,#ffb5d1)', border: 0, borderRadius: 16, boxShadow: '0 6px 0 #cb7fa3', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>重新进入</button>
      </section>
    </main>
  );
};

// 路由配置
const clientBasePath = (process.env.CLIENT_BASE_PATH || '/').replace(/\/$/, '') || '/';

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Navigate to="/home" replace />,
      errorElement: <RouteErrorPage />,
    },
    {
      path: '/home',
      element: (
        <PageLoader>
          <CompanionHomePage />
        </PageLoader>
      ),
      errorElement: <RouteErrorPage />,
    },
    {
      path: '/onboarding',
      element: (
        <PageLoader>
          <OnboardingPage />
        </PageLoader>
      ),
      errorElement: <RouteErrorPage />,
    },
    {
      path: '/map',
      element: (
        <PageLoader>
          <MapPage />
        </PageLoader>
      ),
      errorElement: <RouteErrorPage />,
    },
    {
      path: '/reader/:storyId',
      element: (
        <PageLoader>
          <ReaderPage />
        </PageLoader>
      ),
      errorElement: <RouteErrorPage />,
    },
    {
      path: '/quiz/:storyId',
      element: (
        <PageLoader>
          <QuizPage />
        </PageLoader>
      ),
      errorElement: <RouteErrorPage />,
    },
    {
      path: '/scroll',
      element: (
        <PageLoader>
          <ScrollPage />
        </PageLoader>
      ),
      errorElement: <RouteErrorPage />,
    },
    {
      path: '/settings',
      element: (
        <PageLoader>
          <SettingsPage />
        </PageLoader>
      ),
      errorElement: <RouteErrorPage />,
    },
    {
      path: '*',
      element: <Navigate to="/home" replace />,
    },
  ],
  {
    basename: clientBasePath,
  }
);

export default router;
