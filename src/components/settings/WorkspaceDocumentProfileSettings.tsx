import React, { useState, useEffect } from 'react';
import {
  Workspace,
  UserProfile,
  WorkspaceDocumentProfile,
  DocumentProfileBankAccount,
  QuotationPreset,
  QuotationTaxMode,
  QuotationSignatoryMode
} from '../../types';
import { QuotationRepository } from '../../services/repositories/QuotationRepository';
import {
  Building,
  Landmark,
  Sliders,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  FileText,
  CreditCard,
  Percent,
  Check,
  Palette,
  Image as ImageIcon,
  Edit2,
  X,
  FileCheck,
  ShieldCheck
} from 'lucide-react';

export interface WorkspaceDocumentProfileSettingsProps {
  activeWorkspace?: Workspace | null;
  user: UserProfile;
  isAdmin: boolean;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const WorkspaceDocumentProfileSettings: React.FC<WorkspaceDocumentProfileSettingsProps> = ({
  activeWorkspace,
  user,
  isAdmin,
  triggerToast
}) => {
  const workspaceId = activeWorkspace?.id || 'ws_default';

  // Loading & Saving States
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Legal Identity & Profile State
  const [profileId, setProfileId] = useState<string>('');
  const [profileName, setProfileName] = useState<string>('Standard Legal Profile');
  const [legalEntityName, setLegalEntityName] = useState<string>('');
  const [trn, setTrn] = useState<string>('');
  const [addressLine1, setAddressLine1] = useState<string>('');
  const [addressLine2, setAddressLine2] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [country, setCountry] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [website, setWebsite] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [stampSealUrl, setStampSealUrl] = useState<string>('');
  const [accentColor, setAccentColor] = useState<string>('#2563eb');

  // Bank Accounts State
  const [bankAccounts, setBankAccounts] = useState<DocumentProfileBankAccount[]>([]);
  const [showAddBank, setShowAddBank] = useState<boolean>(false);
  const [newBank, setNewBank] = useState<DocumentProfileBankAccount>({
    bank_name: '',
    account_title: '',
    account_number: '',
    iban: '',
    swift_code: '',
    currency: 'AED',
    is_default: false
  });

  // Quotation Presets State
  const [presets, setPresets] = useState<QuotationPreset[]>([]);
  const [showAddPreset, setShowAddPreset] = useState<boolean>(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetForm, setPresetForm] = useState<Partial<QuotationPreset>>({
    preset_name: '',
    default_tax_mode: 'taxes_extra',
    default_price_basis: 'Ex-Works / Delivered Site',
    default_payment_terms: '100% Advance / Approved Credit',
    default_validity_days: 30,
    signatory_mode: 'single',
    visible_columns: {
      brand: true,
      model: true,
      origin: true,
      availability: true,
      unit_price: true
    }
  });

  // Initial Data Fetch
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      QuotationRepository.getWorkspaceDocumentProfile(workspaceId),
      QuotationRepository.getPresets(workspaceId)
    ])
      .then(([prof, loadedPresets]) => {
        if (!isMounted) return;

        if (prof) {
          setProfileId(prof.id || '');
          setProfileName(prof.profile_name || 'Standard Legal Profile');
          setLegalEntityName(prof.legal_entity_name || activeWorkspace?.name || '');
          setTrn(prof.trn || '');
          setAddressLine1(prof.address_line_1 || '');
          setAddressLine2(prof.address_line_2 || '');
          setCity(prof.city || '');
          setCountry(prof.country || '');
          setPhone(prof.phone || '');
          setEmail(prof.email || '');
          setWebsite(prof.website || '');
          setLogoUrl(prof.logo_url || '');
          setStampSealUrl(prof.stamp_seal_url || '');
          setAccentColor(prof.accent_color || '#2563eb');
          setBankAccounts(prof.bank_accounts || []);
        } else {
          // Pre-populate defaults from workspace
          setLegalEntityName(activeWorkspace?.name || 'Commercial Entity LLC');
          setCountry('United Arab Emirates');
          setCity('Dubai');
        }

        setPresets(loadedPresets);
      })
      .catch((err) => {
        console.error('Failed loading document profile or presets:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workspaceId, activeWorkspace]);

  // Save Legal Profile
  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;
    setSavingProfile(true);

    try {
      const saved = await QuotationRepository.saveWorkspaceDocumentProfile({
        id: profileId || undefined,
        workspace_id: workspaceId,
        workspaceId: workspaceId,
        profile_name: profileName,
        legal_entity_name: legalEntityName,
        trn,
        address_line_1: addressLine1,
        address_line_2: addressLine2,
        city,
        country,
        phone,
        email,
        website,
        logo_url: logoUrl,
        stamp_seal_url: stampSealUrl,
        accent_color: accentColor,
        bank_accounts: bankAccounts,
        is_default: true
      });

      setProfileId(saved.id || '');
      if (triggerToast) {
        triggerToast('Workspace document branding profile updated successfully!', 'success');
      }
    } catch (err: any) {
      console.error('Failed saving profile:', err);
      if (triggerToast) {
        triggerToast(err?.message || 'Failed saving branding profile', 'error');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  // Add Bank Account
  const handleAddBankAccount = () => {
    if (!newBank.bank_name || !newBank.account_number) {
      if (triggerToast) triggerToast('Bank Name and Account Number are required', 'error');
      return;
    }

    const accountId = `bank_${Date.now()}`;
    const accountToAdd: DocumentProfileBankAccount = {
      ...newBank,
      id: accountId,
      is_default: bankAccounts.length === 0 ? true : newBank.is_default
    };

    let updatedList = [...bankAccounts];
    if (accountToAdd.is_default) {
      updatedList = updatedList.map((b) => ({ ...b, is_default: false }));
    }
    updatedList.push(accountToAdd);

    setBankAccounts(updatedList);
    setNewBank({
      bank_name: '',
      account_title: '',
      account_number: '',
      iban: '',
      swift_code: '',
      currency: 'AED',
      is_default: false
    });
    setShowAddBank(false);

    // Auto-save to persistence
    QuotationRepository.saveWorkspaceDocumentProfile({
      id: profileId || undefined,
      workspace_id: workspaceId,
      workspaceId: workspaceId,
      profile_name: profileName,
      legal_entity_name: legalEntityName,
      trn,
      address_line_1: addressLine1,
      address_line_2: addressLine2,
      city,
      country,
      phone,
      email,
      website,
      logo_url: logoUrl,
      stamp_seal_url: stampSealUrl,
      accent_color: accentColor,
      bank_accounts: updatedList
    }).catch(console.error);

    if (triggerToast) triggerToast('Bank account added.', 'success');
  };

  // Delete Bank Account
  const handleDeleteBankAccount = (index: number) => {
    const updated = bankAccounts.filter((_, idx) => idx !== index);
    if (updated.length > 0 && !updated.some((b) => b.is_default)) {
      updated[0].is_default = true;
    }
    setBankAccounts(updated);

    QuotationRepository.saveWorkspaceDocumentProfile({
      id: profileId || undefined,
      workspace_id: workspaceId,
      workspaceId: workspaceId,
      profile_name: profileName,
      legal_entity_name: legalEntityName,
      trn,
      address_line_1: addressLine1,
      address_line_2: addressLine2,
      city,
      country,
      phone,
      email,
      website,
      logo_url: logoUrl,
      stamp_seal_url: stampSealUrl,
      accent_color: accentColor,
      bank_accounts: updated
    }).catch(console.error);

    if (triggerToast) triggerToast('Bank account removed.', 'info');
  };

  // Set Default Bank Account
  const handleSetDefaultBank = (index: number) => {
    const updated = bankAccounts.map((b, idx) => ({
      ...b,
      is_default: idx === index
    }));
    setBankAccounts(updated);

    QuotationRepository.saveWorkspaceDocumentProfile({
      id: profileId || undefined,
      workspace_id: workspaceId,
      workspaceId: workspaceId,
      profile_name: profileName,
      legal_entity_name: legalEntityName,
      trn,
      address_line_1: addressLine1,
      address_line_2: addressLine2,
      city,
      country,
      phone,
      email,
      website,
      logo_url: logoUrl,
      stamp_seal_url: stampSealUrl,
      accent_color: accentColor,
      bank_accounts: updated
    }).catch(console.error);
  };

  // Save / Edit Preset
  const handleSavePreset = async () => {
    if (!presetForm.preset_name?.trim()) {
      if (triggerToast) triggerToast('Preset name is required', 'error');
      return;
    }

    try {
      const payload: QuotationPreset = {
        id: editingPresetId || undefined,
        workspace_id: workspaceId,
        workspaceId: workspaceId,
        preset_name: presetForm.preset_name.trim(),
        default_tax_mode: presetForm.default_tax_mode || 'taxes_extra',
        default_price_basis: presetForm.default_price_basis || 'Ex-Works',
        default_payment_terms: presetForm.default_payment_terms || '100% Advance',
        default_validity_days: Number(presetForm.default_validity_days) || 30,
        signatory_mode: presetForm.signatory_mode || 'single',
        visible_columns: presetForm.visible_columns || {
          brand: true,
          model: true,
          origin: true,
          availability: true,
          unit_price: true
        }
      };

      const saved = await QuotationRepository.savePreset(payload);
      setPresets((prev) => {
        const filtered = prev.filter((p) => p.id !== saved.id);
        return [saved, ...filtered];
      });

      setShowAddPreset(false);
      setEditingPresetId(null);
      setPresetForm({
        preset_name: '',
        default_tax_mode: 'taxes_extra',
        default_price_basis: 'Ex-Works / Delivered Site',
        default_payment_terms: '100% Advance / Approved Credit',
        default_validity_days: 30,
        signatory_mode: 'single',
        visible_columns: {
          brand: true,
          model: true,
          origin: true,
          availability: true,
          unit_price: true
        }
      });

      if (triggerToast) {
        triggerToast(`Quotation preset "${saved.preset_name}" saved.`, 'success');
      }
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(err?.message || 'Failed saving preset', 'error');
      }
    }
  };

  // Delete Preset
  const handleDeletePreset = async (presetId: string) => {
    if (!presetId) return;
    try {
      await QuotationRepository.deletePreset(presetId);
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
      if (triggerToast) triggerToast('Preset deleted.', 'info');
    } catch (err: any) {
      if (triggerToast) triggerToast(err?.message || 'Failed deleting preset', 'error');
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading Document Branding & Presets...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* 1. Legal Identity & Document Branding */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Legal Entity & Quotation Branding</h3>
              <p className="text-xs text-slate-500">
                Official header details, TRN, contacts, and accent styling used on formal A4 quotations.
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => handleSaveProfile()}
              disabled={savingProfile}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingProfile ? 'Saving...' : 'Save Branding'}</span>
            </button>
          )}
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            <div>
              <label className="block text-slate-600 font-bold mb-1.5">
                Official Registered Legal Entity Name
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={legalEntityName}
                onChange={(e) => setLegalEntityName(e.target.value)}
                placeholder="e.g. ADVANCED NIRVANA WATER TREATMENT EQUIPMENT TRADING LLC"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">
                Tax Registration Number (TRN / VAT Reg)
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={trn}
                onChange={(e) => setTrn(e.target.value)}
                placeholder="e.g. 100234567800003"
                className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Physical Address (Line 1)</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="e.g. Suite 402, Al Quoz Industrial Area 3"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Physical Address (Line 2 / P.O. Box)</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="e.g. P.O. Box 48192"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-bold mb-1.5">City</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Dubai"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Country</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="United Arab Emirates"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Official Phone</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+971 4 123 4567"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Sales / Official Email</label>
                <input
                  type="email"
                  disabled={!isAdmin}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sales@company.com"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Website URL</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="www.nirvanawater.ae"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-slate-500" />
                <span>Primary Document Accent Color</span>
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  disabled={!isAdmin}
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-slate-300 p-0.5"
                />
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-32 rounded-xl border border-slate-300 p-2 font-mono uppercase text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Logo Image URL</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://.../logo.png"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Company Stamp / Seal Image URL</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={stampSealUrl}
                onChange={(e) => setStampSealUrl(e.target.value)}
                placeholder="https://.../stamp_seal.png"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Bank Remittance Accounts Manager */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Remittance Bank Accounts</h3>
              <p className="text-xs text-slate-500">
                Wire remittance accounts included in quotation footer.
              </p>
            </div>
          </div>
          {isAdmin && !showAddBank && (
            <button
              type="button"
              onClick={() => setShowAddBank(true)}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl transition flex items-center space-x-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Bank Account</span>
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {showAddBank && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 animate-in fade-in duration-100">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-800">Add New Wire Remittance Account</span>
                <button
                  type="button"
                  onClick={() => setShowAddBank(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Bank Name *</label>
                  <input
                    type="text"
                    value={newBank.bank_name}
                    onChange={(e) => setNewBank({ ...newBank, bank_name: e.target.value })}
                    placeholder="e.g. Emirates NBD"
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Account Title</label>
                  <input
                    type="text"
                    value={newBank.account_title || ''}
                    onChange={(e) => setNewBank({ ...newBank, account_title: e.target.value })}
                    placeholder="e.g. Industrial Trading LLC"
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Account Number *</label>
                  <input
                    type="text"
                    value={newBank.account_number}
                    onChange={(e) => setNewBank({ ...newBank, account_number: e.target.value })}
                    placeholder="101002345678"
                    className="w-full rounded-lg border border-slate-300 p-2 font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">IBAN Number</label>
                  <input
                    type="text"
                    value={newBank.iban || ''}
                    onChange={(e) => setNewBank({ ...newBank, iban: e.target.value })}
                    placeholder="AE07033000101002345678"
                    className="w-full rounded-lg border border-slate-300 p-2 font-mono uppercase bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">SWIFT / BIC</label>
                  <input
                    type="text"
                    value={newBank.swift_code || ''}
                    onChange={(e) => setNewBank({ ...newBank, swift_code: e.target.value })}
                    placeholder="EBILAEADXXX"
                    className="w-full rounded-lg border border-slate-300 p-2 font-mono uppercase bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Currency</label>
                  <select
                    value={newBank.currency || 'AED'}
                    onChange={(e) => setNewBank({ ...newBank, currency: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  >
                    <option value="AED">AED (UAE Dirham)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (British Pound)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newBank.is_default}
                    onChange={(e) => setNewBank({ ...newBank, is_default: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Set as default primary account for new quotes</span>
                </label>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddBank(false)}
                    className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddBankAccount}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                  >
                    Confirm Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {bankAccounts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {bankAccounts.map((b, idx) => (
                <div
                  key={b.id || idx}
                  className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                    b.is_default
                      ? 'bg-emerald-50/40 border-emerald-300 shadow-2xs'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-900 text-xs">{b.bank_name}</span>
                        {b.is_default && (
                          <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                            PRIMARY DEFAULT
                          </span>
                        )}
                      </div>
                      {b.account_title && (
                        <p className="text-[11px] text-slate-600 mt-0.5">{b.account_title}</p>
                      )}
                    </div>

                    {isAdmin && (
                      <div className="flex items-center space-x-1">
                        {!b.is_default && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultBank(idx)}
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50"
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteBankAccount(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase">Account #</span>
                      <span className="text-slate-800 font-bold">{b.account_number}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase">Currency</span>
                      <span className="text-slate-800 font-bold">{b.currency || 'AED'}</span>
                    </div>
                    {b.iban && (
                      <div className="col-span-2">
                        <span className="text-slate-400 block text-[9px] uppercase">IBAN</span>
                        <span className="text-slate-800 font-bold truncate block">{b.iban}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
              <p className="text-xs text-slate-500">No remittance bank accounts configured yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Quotation Presets Manager */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Quotation Template Presets</h3>
              <p className="text-xs text-slate-500">
                Custom presets with default table columns, tax modes, and terms for instant drafting.
              </p>
            </div>
          </div>
          {isAdmin && !showAddPreset && (
            <button
              type="button"
              onClick={() => {
                setEditingPresetId(null);
                setPresetForm({
                  preset_name: '',
                  default_tax_mode: 'taxes_extra',
                  default_price_basis: 'Ex-Works / Delivered Site',
                  default_payment_terms: '100% Advance / Approved Credit',
                  default_validity_days: 30,
                  signatory_mode: 'single',
                  visible_columns: {
                    brand: true,
                    model: true,
                    origin: true,
                    availability: true,
                    unit_price: true
                  }
                });
                setShowAddPreset(true);
              }}
              className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl transition flex items-center space-x-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Preset</span>
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {showAddPreset && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 animate-in fade-in duration-100">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-800">
                  {editingPresetId ? 'Edit Quotation Preset' : 'Configure New Preset'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddPreset(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Preset Name *</label>
                  <input
                    type="text"
                    value={presetForm.preset_name || ''}
                    onChange={(e) => setPresetForm({ ...presetForm, preset_name: e.target.value })}
                    placeholder="e.g. Standard Chemical Offer / Technical Proposal"
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Default Tax Mode</label>
                  <select
                    value={presetForm.default_tax_mode || 'taxes_extra'}
                    onChange={(e) =>
                      setPresetForm({
                        ...presetForm,
                        default_tax_mode: e.target.value as QuotationTaxMode
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  >
                    <option value="taxes_extra">Taxes Extra (5% Add-on)</option>
                    <option value="tax_calculated">Inclusive (Tax in Price)</option>
                    <option value="tax_exempt">Tax Exempt (0%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Default Price Basis</label>
                  <input
                    type="text"
                    value={presetForm.default_price_basis || ''}
                    onChange={(e) =>
                      setPresetForm({ ...presetForm, default_price_basis: e.target.value })
                    }
                    placeholder="e.g. Ex-Works Dubai / Delivered Site"
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Default Payment Terms</label>
                  <input
                    type="text"
                    value={presetForm.default_payment_terms || ''}
                    onChange={(e) =>
                      setPresetForm({ ...presetForm, default_payment_terms: e.target.value })
                    }
                    placeholder="e.g. 100% Advance Against PI"
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Validity (Days)</label>
                  <input
                    type="number"
                    value={presetForm.default_validity_days || 30}
                    onChange={(e) =>
                      setPresetForm({
                        ...presetForm,
                        default_validity_days: Number(e.target.value) || 30
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Signatory Mode</label>
                  <select
                    value={presetForm.signatory_mode || 'single'}
                    onChange={(e) =>
                      setPresetForm({
                        ...presetForm,
                        signatory_mode: e.target.value as QuotationSignatoryMode
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  >
                    <option value="single">Single Signatory (Deal Owner)</option>
                    <option value="dual">Dual Signatory (Owner + Manager)</option>
                    <option value="stamp_only">Company Seal Only</option>
                    <option value="none">None / Plain Document</option>
                  </select>
                </div>

                <div className="col-span-2 pt-2 border-t border-slate-200">
                  <label className="block text-slate-600 font-bold mb-2">Visible Table Columns</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries({
                      brand: 'Brand / Make',
                      model: 'Model / Part #',
                      origin: 'Country of Origin',
                      availability: 'Delivery Time',
                      unit_price: 'Unit Price'
                    }).map(([colKey, colLabel]) => (
                      <label key={colKey} className="flex items-center space-x-2 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(presetForm.visible_columns as any)?.[colKey] ?? true}
                          onChange={(e) =>
                            setPresetForm({
                              ...presetForm,
                              visible_columns: {
                                ...presetForm.visible_columns,
                                [colKey]: e.target.checked
                              }
                            })
                          }
                          className="rounded border-slate-300 text-purple-600"
                        />
                        <span className="text-slate-700">{colLabel}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddPreset(false)}
                  className="px-3.5 py-2 border border-slate-300 text-slate-600 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePreset}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold"
                >
                  Save Preset
                </button>
              </div>
            </div>
          )}

          {presets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {presets.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-purple-300 transition shadow-2xs flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">{p.preset_name}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Validity: {p.default_validity_days || 30} days • {p.default_tax_mode}
                      </p>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPresetId(p.id || null);
                            setPresetForm({
                              preset_name: p.preset_name,
                              default_tax_mode: p.default_tax_mode,
                              default_price_basis: p.default_price_basis,
                              default_payment_terms: p.default_payment_terms,
                              default_validity_days: p.default_validity_days,
                              signatory_mode: p.signatory_mode,
                              visible_columns: p.visible_columns
                            });
                            setShowAddPreset(true);
                          }}
                          className="p-1 text-slate-400 hover:text-purple-600 rounded"
                          title="Edit Preset"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(p.id!)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Delete Preset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                    {p.visible_columns?.brand && (
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                        Brand
                      </span>
                    )}
                    {p.visible_columns?.model && (
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                        Model
                      </span>
                    )}
                    {p.visible_columns?.origin && (
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                        Origin
                      </span>
                    )}
                    {p.visible_columns?.availability && (
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                        Delivery
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
              <p className="text-xs text-slate-500">No quotation presets created yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
