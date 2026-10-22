import type { ProfileErrors, WorkspaceProfile } from './types';

export const ACTIVE_DEMO_WORKSPACE_ID = 'demo-commerce-workspace';
const STORAGE_PREFIX = 'commerce-studio:workspace-profile:';
export const SUPPORTED_CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP'] as const;
export const SUPPORTED_LOCALES = ['en-US', 'en-CA', 'en-GB', 'fr-CA'] as const;
export const SUPPORTED_TAX_PREFERENCES = ['prices_exclude_tax', 'prices_include_tax', 'tax_exempt'] as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function profileStorageKey(workspaceId: string): string {
  return `${STORAGE_PREFIX}${workspaceId}`;
}

export function validateWorkspaceProfile(profile: WorkspaceProfile): ProfileErrors {
  const errors: ProfileErrors = {};
  const requiredFields: Array<keyof WorkspaceProfile> = [
    'workspaceName',
    'businessDisplayName',
    'legalName',
    'address',
    'email',
    'phone',
  ];

  for (const field of requiredFields) {
    if (!profile[field].trim()) {
      errors[field] = 'This field is required.';
    }
  }

  if (profile.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (profile.phone.trim() && !/^[+\d][\d\s().-]{6,}$/.test(profile.phone.trim())) {
    errors.phone = 'Enter a valid phone number.';
  }

  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(profile.currency)) {
    errors.currency = 'Choose a supported currency.';
  }

  if (!(SUPPORTED_LOCALES as readonly string[]).includes(profile.locale)) {
    errors.locale = 'Choose a supported locale.';
  }

  if (!(SUPPORTED_TAX_PREFERENCES as readonly string[]).includes(profile.taxPreference)) {
    errors.taxPreference = 'Choose a supported tax preference.';
  }

  return errors;
}

export function loadWorkspaceProfile(
  storage: StorageLike,
  workspaceId = ACTIVE_DEMO_WORKSPACE_ID,
): WorkspaceProfile | null {
  const raw = storage.getItem(profileStorageKey(workspaceId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceProfile>;
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      workspaceName: typeof parsed.workspaceName === 'string' ? parsed.workspaceName : '',
      businessDisplayName:
        typeof parsed.businessDisplayName === 'string' ? parsed.businessDisplayName : '',
      legalName: typeof parsed.legalName === 'string' ? parsed.legalName : '',
      address: typeof parsed.address === 'string' ? parsed.address : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
       currency: typeof parsed.currency === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(parsed.currency) ? parsed.currency : 'USD',
       locale: typeof parsed.locale === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(parsed.locale) ? parsed.locale : 'en-US',
      taxPreference:
        parsed.taxPreference === 'prices_include_tax' || parsed.taxPreference === 'tax_exempt'
          ? parsed.taxPreference
          : 'prices_exclude_tax',
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceProfile(
  storage: StorageLike,
  profile: WorkspaceProfile,
  workspaceId = ACTIVE_DEMO_WORKSPACE_ID,
): void {
  storage.setItem(profileStorageKey(workspaceId), JSON.stringify(profile));
}
