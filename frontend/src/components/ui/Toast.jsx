/**
 * Styled Toaster configuration for react-hot-toast.
 *
 * Usage in App.jsx:
 *   import { Toaster } from "react-hot-toast";
 *   import { toasterConfig } from "@/components/ui/Toast";
 *   <Toaster {...toasterConfig} />
 *
 * To show toasts anywhere:
 *   import toast from "react-hot-toast";
 *   toast.success("NFT minted!");
 *   toast.error("Transaction failed");
 */

export const toasterConfig = {
  position: "bottom-right",
  toastOptions: {
    duration: 4000,
    style: {
      background: "rgba(15, 15, 20, 0.9)",
      color: "#e5e7eb",
      border: "1px solid rgba(139, 92, 246, 0.2)",
      borderRadius: "12px",
      backdropFilter: "blur(12px)",
      fontSize: "14px",
      padding: "12px 16px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
    },
    success: {
      iconTheme: {
        primary: "#8b5cf6",
        secondary: "#fff",
      },
    },
    error: {
      iconTheme: {
        primary: "#ef4444",
        secondary: "#fff",
      },
    },
  },
};
