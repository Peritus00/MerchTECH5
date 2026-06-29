import AsyncStorage from '@react-native-async-storage/async-storage';
import { openAccessLeadsAPI } from '@/services/api';

export type OpenAccessBypassResult =
  | { bypass: true; leadId?: number }
  | { bypass: false };

export async function resolveOpenAccessLeadBypass(options: {
  contentType: 'playlist' | 'slideshow';
  contentId: string;
  isAuthenticated: boolean;
}): Promise<OpenAccessBypassResult> {
  const storageKey = `open_access_lead_${options.contentType}_${options.contentId}`;
  const storedLead = await AsyncStorage.getItem(storageKey);
  const storedLeadId = Number(storedLead);
  if (Number.isFinite(storedLeadId) && storedLeadId > 0) {
    return { bypass: true, leadId: storedLeadId };
  }

  if (options.isAuthenticated) {
    try {
      const result = await openAccessLeadsAPI.checkAccess(options.contentType, options.contentId);
      if (result.hasAccess) {
        const leadId = result.access?.leadId != null ? Number(result.access.leadId) : undefined;
        if (leadId != null && Number.isFinite(leadId) && leadId > 0) {
          await AsyncStorage.setItem(storageKey, String(leadId));
        }
        return { bypass: true, leadId: leadId && Number.isFinite(leadId) ? leadId : undefined };
      }
    } catch {
      // Non-blocking; show the lead gate if the access check fails.
    }
  }

  return { bypass: false };
}
