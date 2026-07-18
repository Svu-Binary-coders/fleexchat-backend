import { supabase } from "../../config/supabase.config.js";
import ServiceError from "../../helper/servicesError.helper.js";

export const createBackupKey = async (
  userId: string,
  publicBase64Key: string,
  saltKey: string,
  encryptedBackupKey: {
    ctBase64: string;
    ivBase64: string;
  },
  identityBackup: {
    encPrivKeyB64: string;
    privKeyIvB64: string;
    sigKeyB64: string;
    sigKeyIvB64: string;
  },
) => {
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (userError) throw new ServiceError("Error checking user", 500);
  if (!user) throw new ServiceError("User not found", 404);

  const { error: insertError } = await supabase.from("backup_keys").insert({
    user_id: user.id,
    public_key_64: publicBase64Key,
    salt_b64: saltKey,
    enc_backup_key_ct_b64: encryptedBackupKey.ctBase64,
    enc_backup_key_iv_b64: encryptedBackupKey.ivBase64,
    identity_enc_priv_key_b64: identityBackup.encPrivKeyB64,
    identity_priv_key_iv_b64: identityBackup.privKeyIvB64,
    identity_sig_key_b64: identityBackup.sigKeyB64,
    identity_sig_key_iv_b64: identityBackup.sigKeyIvB64,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      throw new ServiceError("Backup key already exists for this user", 409);
    }
    throw new ServiceError(
      `Failed to create backup key: ${insertError.message}`,
      500,
    );
  }

  return true;
};

export const getBackupData = async (userId: string) => {
  const { data: backupData, error: backupError } = await supabase
    .from("backup_keys")
    .select(
      "public_key_64, salt_b64, enc_backup_key_ct_b64, enc_backup_key_iv_b64, is_mfa_enabled, identity_enc_priv_key_b64, identity_priv_key_iv_b64, identity_sig_key_b64, identity_sig_key_iv_b64",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (backupError) throw new ServiceError("Error fetching backup data", 500);
  if (!backupData)
    throw new ServiceError("Backup keys not found for this user", 404);

  return {
    publicKey64: backupData.public_key_64,
    saltB64: backupData.salt_b64,
    encBackupKey: {
      ctB64: backupData.enc_backup_key_ct_b64,
      ivB64: backupData.enc_backup_key_iv_b64,
    },
    isMFAEnabled: backupData.is_mfa_enabled,
    identityBackup: {
      encPrivKeyB64: backupData.identity_enc_priv_key_b64,
      privKeyIvB64: backupData.identity_priv_key_iv_b64,
      sigKeyB64: backupData.identity_sig_key_b64,
      sigKeyIvB64: backupData.identity_sig_key_iv_b64,
    },
  };
};

export const updateBackupKey = async (
  userId: string,
  newSaltKey: string,
  newEncryptedBackupKey: {
    ctBase64: string;
    ivBase64: string;
  },
) => {
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (userError) throw new ServiceError("Error checking user", 500);
  if (!user) throw new ServiceError("User not found", 404);

  const { data: updated, error: updateError } = await supabase
    .from("backup_keys")
    .update({
      salt_b64: newSaltKey,
      enc_backup_key_ct_b64: newEncryptedBackupKey.ctBase64,
      enc_backup_key_iv_b64: newEncryptedBackupKey.ivBase64,
    })
    .eq("user_id", user.id)
    .select("user_id")
    .maybeSingle();

  if (updateError) throw new ServiceError("Error updating backup key", 500);
  if (!updated)
    throw new ServiceError("Backup key document not found to update", 404);

  return true;
};

export const getPublicKeyForUser = async (userId: string) => {
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw new ServiceError("Error checking user", 500);
  if (!user) throw new ServiceError("User not found", 404);

  const { data: backupData, error: backupError } = await supabase
    .from("backup_keys")
    .select("public_key_64")
    .eq("user_id", user.id)
    .maybeSingle();

  if (backupError) throw new ServiceError("Error fetching public key", 500);
  if (!backupData)
    throw new ServiceError("Public keys not found for this user", 404);

  return backupData.public_key_64;
};
