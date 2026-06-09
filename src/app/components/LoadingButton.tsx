"use client";

import { ButtonHTMLAttributes } from "react";

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string | null;
}

export function LoadingButton({ isLoading, loadingText = "Loading...", disabled, children, className = "", ...props }: LoadingButtonProps) {
  return (
    <button {...props} disabled={disabled || isLoading} className={className}>
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
          {loadingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
