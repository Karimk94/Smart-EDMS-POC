/**
 * Format a name by replacing underscores with spaces and capitalizing each word
 * @param name - The name to format (e.g., "mattar_al_tayer")
 * @returns Formatted name (e.g., "Mattar Al Tayer")
 */
export function formatName(name: string): string {
  if (!name || typeof name !== "string") return "";
  
  return name
    .replace(/_/g, " ") // Replace underscores with spaces
    .split(" ") // Split by spaces
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize first letter, lowercase rest
    .join(" "); // Join back with spaces
}
