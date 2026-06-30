import * as admin from "firebase-admin";
import env from "../config/env";

const globalForFirebase = global as unknown as { firebaseApp?: admin.app.App };

function initApp(): admin.app.App {
    if (globalForFirebase.firebaseApp) {
        return globalForFirebase.firebaseApp;
    }

    const app = env.FIRESTORE_EMULATOR_HOST
        ? admin.initializeApp({ projectId: env.FIREBASE_PROJECT_ID || "demo-project" })
        : admin.initializeApp({
              credential: admin.credential.cert({
                  projectId: env.FIREBASE_PROJECT_ID,
                  clientEmail: env.FIREBASE_CLIENT_EMAIL,
                  // Render/Railway env vars store \n literally; convert back to real newlines.
                  privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
              }),
          });

    if (env.NODE_ENV !== "production") globalForFirebase.firebaseApp = app;
    return app;
}

export const db = initApp().firestore();

export default db;
