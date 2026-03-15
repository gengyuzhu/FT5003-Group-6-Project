import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FiHome, FiArrowRight } from "react-icons/fi";

const pageVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

export default function NotFound() {
  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center"
    >
      <h1 className="text-[8rem] sm:text-[10rem] font-extrabold leading-none gradient-text select-none">
        404
      </h1>
      <h2 className="text-2xl sm:text-3xl font-bold text-white mt-2">
        Page Not Found
      </h2>
      <p className="text-dark-300 mt-4 max-w-md">
        The page you are looking for doesn't exist or has been moved.
        Let's get you back on track.
      </p>
      <div className="flex gap-4 mt-8">
        <Link
          to="/"
          className="btn-primary inline-flex items-center gap-2 px-6 py-3"
        >
          <FiHome /> Go Home
        </Link>
        <Link
          to="/explore"
          className="btn-secondary inline-flex items-center gap-2 px-6 py-3"
        >
          Explore NFTs <FiArrowRight />
        </Link>
      </div>
    </motion.div>
  );
}
