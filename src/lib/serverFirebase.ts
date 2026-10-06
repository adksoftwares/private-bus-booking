import { initializeApp, getApps, getApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getDatabase, Database } from 'firebase-admin/database';

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'bus-booking-system-b731d';
const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || 
  'https://bus-booking-system-b731d-default-rtdb.asia-southeast1.firebasedatabase.app';

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  // Initialize Firebase Admin SDK
  // In Cloud Functions or GCP environments, Google Application Default Credentials are used automatically.
  // In development/self-hosted environments, service account credentials can be supplied via FIREBASE_SERVICE_ACCOUNT.
  return initializeApp({
    projectId,
    databaseURL
  });
}

function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

function getAdminDatabase(): Database {
  return getDatabase(getAdminApp());
}

// Alias for seamless backward compatibility across route handlers
const getServerDatabase = getAdminDatabase;

export {
  getAdminApp,
  getAdminAuth,
  getAdminDatabase,
  getServerDatabase
};
