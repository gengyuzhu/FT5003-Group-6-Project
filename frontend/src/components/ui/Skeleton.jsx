import { motion } from "framer-motion";

/**
 * Reusable skeleton loading components for various page layouts.
 */

export function SkeletonPulse({ className = "" }) {
  return <div className={`bg-dark-800 animate-pulse rounded ${className}`} />;
}

export function NFTCardSkeleton() {
  return (
    <div className="glass-card overflow-hidden animate-pulse break-inside-avoid mb-5">
      <div className="h-56 bg-dark-800" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-dark-800 rounded w-3/4" />
        <div className="h-3 bg-dark-800 rounded w-1/2" />
        <div className="flex justify-between items-center pt-1">
          <div className="h-5 bg-dark-800 rounded w-20" />
          <div className="h-8 bg-dark-800 rounded w-16" />
        </div>
      </div>
    </div>
  );
}

export function NFTDetailSkeleton() {
  return (
    <div className="min-h-screen bg-dark-950 py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto animate-pulse">
      <div className="h-4 bg-dark-800 rounded w-48 mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="aspect-square bg-dark-800 rounded-2xl" />
        <div className="space-y-6">
          <div className="h-3 bg-dark-800 rounded w-20" />
          <div className="h-8 bg-dark-800 rounded w-3/4" />
          <div className="space-y-2">
            <div className="h-3 bg-dark-800 rounded w-full" />
            <div className="h-3 bg-dark-800 rounded w-5/6" />
          </div>
          <div className="flex gap-6">
            <div className="space-y-2">
              <div className="h-3 bg-dark-800 rounded w-14" />
              <div className="h-8 bg-dark-800 rounded w-32" />
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-dark-800 rounded w-14" />
              <div className="h-8 bg-dark-800 rounded w-32" />
            </div>
          </div>
          <div className="glass-card p-6 space-y-4">
            <div className="h-3 bg-dark-800 rounded w-16" />
            <div className="h-8 bg-dark-800 rounded w-32" />
            <div className="h-12 bg-dark-800 rounded w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-dark-950 py-10 px-4 animate-pulse">
      <div className="max-w-7xl mx-auto">
        <div className="h-48 bg-dark-800 rounded-2xl mb-6" />
        <div className="flex items-end gap-4 -mt-16 ml-6 mb-8">
          <div className="w-24 h-24 rounded-full bg-dark-700 border-4 border-dark-950" />
          <div className="space-y-2 mb-2">
            <div className="h-6 bg-dark-800 rounded w-40" />
            <div className="h-4 bg-dark-800 rounded w-28" />
          </div>
        </div>
        <div className="flex gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-dark-800 rounded w-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <NFTCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MarketSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-dark-950 py-12 px-4 max-w-[1440px] mx-auto animate-pulse"
    >
      <div className="h-8 bg-dark-800 rounded w-64 mb-4" />
      <div className="h-4 bg-dark-800 rounded w-96 mb-10" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-5 space-y-3">
            <div className="h-3 bg-dark-800 rounded w-20" />
            <div className="h-6 bg-dark-800 rounded w-28" />
            <div className="h-3 bg-dark-800 rounded w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 glass-card p-6 h-80 bg-dark-800 rounded" />
        <div className="lg:col-span-7 glass-card p-6 h-80 bg-dark-800 rounded" />
      </div>
    </motion.div>
  );
}
