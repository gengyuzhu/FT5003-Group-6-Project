import { Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import Layout from "@/components/layout/Layout";
import ScrollToTop from "@/components/layout/ScrollToTop";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { toasterConfig } from "@/components/ui/Toast";

// Lazy-load pages
import { lazy, Suspense } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

const Home = lazy(() => import("@/pages/Home"));
const Explore = lazy(() => import("@/pages/Explore"));
const Create = lazy(() => import("@/pages/Create"));
const NFTDetail = lazy(() => import("@/pages/NFTDetail"));
const Profile = lazy(() => import("@/pages/Profile"));
const Activity = lazy(() => import("@/pages/Activity"));
const Collection = lazy(() => import("@/pages/Collection"));
const Market = lazy(() => import("@/pages/Market"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function App() {
  return (
    <>
      <Toaster {...toasterConfig} />
      <ScrollToTop />
      <Layout>
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/create" element={<Create />} />
              <Route path="/nft/:id" element={<NFTDetail />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/collection/:slug" element={<Collection />} />
              <Route path="/market" element={<Market />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Layout>
    </>
  );
}

export default App;
