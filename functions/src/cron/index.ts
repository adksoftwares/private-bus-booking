import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Sweep expired seat locks every minute
export const clearExpiredSeatLocks = functions.pubsub.schedule("every 1 minutes").onRun(async (context) => {
  const db = admin.database();
  const locksRef = db.ref("seatLocks");
  
  const snapshot = await locksRef.once("value");
  if (!snapshot.exists()) return null;

  const now = Date.now();
  const updates: any = {};
  
  snapshot.forEach((tripSnap) => {
    const tripId = tripSnap.key;
    tripSnap.forEach((seatSnap) => {
      const seatId = seatSnap.key;
      const data = seatSnap.val();
      
      if (data.status === "locked" && data.expiresAt && data.expiresAt < now) {
        updates[`${tripId}/${seatId}`] = null; // Delete the lock
      }
    });
  });

  if (Object.keys(updates).length > 0) {
    await locksRef.update(updates);
    console.log(`Cleared ${Object.keys(updates).length} expired seat locks.`);
  }
  
  return null;
});
