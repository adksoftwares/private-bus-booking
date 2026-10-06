import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

export const registerOwner = functions.https.onCall(async (data, context) => {
  // Ensure the user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be signed in to register as an owner."
    );
  }

  const uid = context.auth.uid;
  const { name, phone, nic, address } = data;

  try {
    // 1. Set custom user claims for the Owner role and pending status
    await admin.auth().setCustomUserClaims(uid, {
      role: "Owner",
      status: "pending",
    });

    // 2. Add owner profile to Realtime Database
    const ownerData = {
      name,
      phone,
      nic,
      address,
      status: "pending",
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    await admin.database().ref(`owners/${uid}`).set(ownerData);

    return { success: true, message: "Owner registration submitted for approval." };
  } catch (error) {
    console.error("Error registering owner:", error);
    throw new functions.https.HttpsError("internal", "Failed to register owner.");
  }
});

// Admin function to approve a pending owner
export const approveOwner = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'Admin') {
    throw new functions.https.HttpsError("permission-denied", "Only admins can approve owners.");
  }

  const { ownerId } = data;
  try {
    // 1. Update custom claims
    await admin.auth().setCustomUserClaims(ownerId, {
      role: "Owner",
      status: "approved",
    });

    // 2. Update Realtime DB
    await admin.database().ref(`owners/${ownerId}/status`).set('approved');

    return { success: true };
  } catch (error) {
    console.error("Error approving owner:", error);
    throw new functions.https.HttpsError("internal", "Failed to approve owner.");
  }
});

// Owner function to create staff
export const createStaff = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'Owner') {
    throw new functions.https.HttpsError("permission-denied", "Only approved owners can add staff.");
  }

  const ownerId = context.auth.uid;
  const { name, phone, role, email, password } = data; // role should be "Driver" or "Conductor"

  if (role !== "Driver" && role !== "Conductor") {
    throw new functions.https.HttpsError("invalid-argument", "Role must be Driver or Conductor.");
  }

  try {
    // 1. Create User in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      phoneNumber: phone.startsWith('+') ? phone : undefined, // Must be E.164 format if provided
    });

    // 2. Set custom user claims for the Driver/Conductor role
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: role,
      ownerId: ownerId, // Link them to this specific owner
    });

    // 3. Add staff profile to Realtime Database
    const staffData = {
      name,
      phone,
      email,
      role,
      ownerId,
      createdAt: admin.database.ServerValue.TIMESTAMP,
    };

    await admin.database().ref(`staff/${ownerId}/${userRecord.uid}`).set(staffData);

    return { success: true, message: `${role} created successfully.`, uid: userRecord.uid };
  } catch (error: any) {
    console.error(`Error creating ${role}:`, error);
    throw new functions.https.HttpsError("internal", error.message || "Failed to create staff.");
  }
});
