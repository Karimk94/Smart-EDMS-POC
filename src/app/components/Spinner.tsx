export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-gray-500 dark:text-gray-400">
      <span className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
