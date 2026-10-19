/* Public browser configuration. Never put secret/service_role keys here. */
window.FRETATTACK_SUPABASE_CONFIG = Object.freeze({
  url: "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE",
  publishableKey: "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE",
  // Add the exact origin of your development/test site, and production.
  allowedOrigins: [
    "https://www.fretattackapp.com",
    "https://YOUR-TESTING-SITE.example"
  ]
});
