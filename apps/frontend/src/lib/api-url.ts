/**
 * Utility to safely retrieve the backend API URL.
 * Handles cases where environment variables might be duplicated or concatenated with a comma
 * by hosting platforms (e.g., Render or Vercel config overrides).
 */
export function getApiUrl(): string {
  const envVal = process.env.NEXT_PUBLIC_API_URL;
  if (!envVal) {
    return 'http://localhost:5001';
  }

  // If the env contains a comma, parse and extract the correct external URL
  if (envVal.includes(',')) {
    const urls = envVal.split(',').map((url) => url.trim());
    
    // Look for the production/staging https URL that is not localhost
    const productionUrl = urls.find(
      (url) => url.startsWith('https://') && !url.includes('localhost')
    );
    
    return productionUrl || urls[urls.length - 1] || 'http://localhost:5001';
  }

  return envVal;
}
