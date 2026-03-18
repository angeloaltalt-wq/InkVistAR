// Determine the API URL based on the environment
const isProduction = process.env.NODE_ENV === 'production';

// For production, use the environment variable set in your hosting provider (e.g., Vercel).
// For development, use the local backend server.
export const API_URL = isProduction 
    ? process.env.REACT_APP_API_URL 
    : 'http://localhost:3001';

// You can add a check to ensure the production variable is set
if (isProduction && !process.env.REACT_APP_API_URL) {
    console.error("FATAL: REACT_APP_API_URL is not defined in the production environment.");
}
