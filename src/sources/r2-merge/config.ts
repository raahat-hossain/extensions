import {
  loadConfig as loadR2Config,
  saveConfig,
  SETTINGS,
  type R2Config,
} from "../r2-library/config";

export { saveConfig, SETTINGS, type R2Config };

export const loadConfig = async (): Promise<R2Config> => {
  try {
    return await loadR2Config();
  } catch (error) {
    const message = String((error as { message?: string })?.message ?? error);
    if (message.includes("R2 Library is not configured")) {
      throw new Error(
        "R2 Merge is not configured. Open source settings and set Account ID, Access Key ID, Secret Access Key, and Bucket.",
      );
    }
    throw error;
  }
};
