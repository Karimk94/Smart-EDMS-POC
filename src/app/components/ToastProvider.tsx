"use client";

import Image from "next/image";
import { createContext, ReactNode, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", duration = 3500) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((current) => [...current, { id, message, type }]);

      if (duration > 0) {
        window.setTimeout(() => removeToast(id), duration);
      }

      return id;
    },
    [removeToast],
  );

  const styles: Record<ToastType, string> = {
    success:
      "bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800",
    error: "bg-red-100 text-red-800 border border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800",
    warning:
      "bg-yellow-100 text-yellow-800 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800",
    info: "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800",
  };

  const icons: Record<ToastType, string> = {
    success: "/icons/check.svg",
    error: "/icons/close.svg",
    warning: "/icons/warning.svg",
    info: "/icons/info.svg",
  };

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className={`pointer-events-auto min-w-[300px] max-w-md p-4 rounded-lg shadow-lg flex items-center gap-3 text-left transition hover:scale-[1.01] ${styles[toast.type]}`}
          >
            <Image src={icons[toast.type]} alt="" width={22} height={22} className="dark:invert" />
            <span className="text-sm font-medium leading-snug">{toast.message}</span>
            <Image src="/icons/close.svg" alt="" width={14} height={14} className="ml-auto opacity-45 dark:invert" />
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
