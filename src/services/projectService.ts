import { Project, ProjectMilestone, Enquiry, UserProfile } from '../types';
import { safeAddDoc, safeDeleteDoc, safeGetDocs, safeUpdateDoc } from '../firebase';
import { where } from 'firebase/firestore';
import { reserveEnquiryStock, releaseEnquiryStock, isOptionActiveForInventoryAndBaseline } from './inventoryService';

export interface ProjectConversionOptions {
  project_type?: 'Supply Only' | 'Turnkey / Installation';
  assigned_engineer_name?: string;
  assigned_engineer_id?: string;
  target_delivery_date?: string;
  site_location?: string;
  milestones?: ProjectMilestone[];
  operational_notes?: string;
  selected_option?: string;
}

export function getDefaultMilestones(projectType: 'Supply Only' | 'Turnkey / Installation'): ProjectMilestone[] {
  if (projectType === 'Turnkey / Installation') {
    return [
      { id: 'm1', title: 'Procurement & Fabrication', status: 'In Progress' },
      { id: 'm2', title: 'Site Delivery', status: 'Pending' },
      { id: 'm3', title: 'Mechanical & Electrical Installation', status: 'Pending' },
      { id: 'm4', title: 'Testing & Commissioning', status: 'Pending' },
      { id: 'm5', title: 'Client Handover & Taking-Over Certificate (TOC)', status: 'Pending' }
    ];
  }
  return [
    { id: 'm1', title: 'Warehouse Picking & Staging', status: 'In Progress' },
    { id: 'm2', title: 'Outbound Dispatch & Delivery Note', status: 'Pending' }
  ];
}

export async function generateNextProjectNumber(workspaceId: string): Promise<string> {
  const currentYear = new Date().getFullYear();
  let maxSeq = 0;

  try {
    const snap = workspaceId
      ? await safeGetDocs('projects', where('workspace_id', '==', workspaceId))
      : await safeGetDocs('projects');
    if (snap && !snap.empty) {
      snap.docs.forEach((d) => {
        const data = d.data();
        const pNum = data.project_number || '';
        // Match PRJ-YYYY-XXXX or PRJ-XXXX
        const match = pNum.match(/PRJ-\d{4}-(\d+)/i) || pNum.match(/PRJ-(\d+)/i);
        if (match && match[1]) {
          const val = parseInt(match[1], 10);
          if (!isNaN(val) && val > maxSeq) {
            maxSeq = val;
          }
        }
      });
    }
  } catch (err) {
    console.warn('Failed to query existing project sequence numbers:', err);
  }

  const nextSeq = String(maxSeq + 1).padStart(4, '0');
  return `PRJ-${currentYear}-${nextSeq}`;
}

export async function createProjectFromEnquiry(
  enquiry: Enquiry,
  user?: UserProfile | { uid?: string; name?: string; full_name?: string; username?: string; email?: string },
  options?: ProjectConversionOptions,
  overrides?: Partial<Project>
): Promise<Project> {
  const wsId = enquiry.workspace_id || (enquiry as any).workspaceId || 'default';
  const projectNumber = await generateNextProjectNumber(wsId);
  const nowIso = new Date().toISOString();

  const winningOption = (options?.selected_option || enquiry.proposal_option || '').trim();
  const rawLineItems = enquiry.line_items || [];

  // Filter line items to the winning option (plus Default / Included baseline items) and always exclude Optional / Add-On items
  const distinctAlternativeOptions = Array.from(
    new Set(
      rawLineItems
        .map((it) => (it.option || it.item_option || (it as any).option_designation || 'Default / Included').trim())
        .filter((opt) => opt && opt !== 'Default / Included' && opt !== 'Baseline / All')
    )
  );
  const confirmedLineItems = rawLineItems.filter((it) => {
    const itemOpt = it.option || it.item_option || (it as any).option_designation;
    return isOptionActiveForInventoryAndBaseline(itemOpt, winningOption);
  });

  const isTurnkeyDetected = confirmedLineItems.some(
    (it) =>
      (it.description || '').toLowerCase().includes('installation') ||
      (it.product_type || '').toLowerCase().includes('fabrication')
  );

  const finalProjectType: 'Supply Only' | 'Turnkey / Installation' =
    options?.project_type || (isTurnkeyDetected ? 'Turnkey / Installation' : 'Supply Only');

  const generatedMilestones =
    options?.milestones && options.milestones.length > 0
      ? options.milestones
      : getDefaultMilestones(finalProjectType);

  const fallbackEngineerName =
    user?.full_name ||
    (user as any)?.name ||
    (user as any)?.displayName ||
    (user as any)?.username ||
    '';
  const assignedEngineerName =
    options?.assigned_engineer_name !== undefined ? options.assigned_engineer_name : fallbackEngineerName;
  const assignedEngineerId =
    options?.assigned_engineer_id !== undefined ? options.assigned_engineer_id : (user?.uid || '');
  const siteLocation =
    options?.site_location !== undefined ? options.site_location : (enquiry.project_location || (enquiry as any).location || '');
  const targetDeliveryDate = options?.target_delivery_date;
  const operationalNotes =
    options?.operational_notes !== undefined ? options.operational_notes : (enquiry.remarks || '');

  // Calculate contract value for the confirmed option if multi-option and not overridden
  const confirmedItemsValue = confirmedLineItems.reduce((sum, it) => {
    const rawLineVal =
      Number(it.total_price) || (Number(it.quantity) || 1) * (Number(it.unit_price) || 0);
    return it.item_type === 'discount' ? sum - Math.abs(rawLineVal) : sum + rawLineVal;
  }, 0);
  const resolvedContractValue =
    distinctAlternativeOptions.length > 1 && confirmedItemsValue > 0
      ? enquiry.currency === 'USD'
        ? confirmedItemsValue * 3.6725
        : confirmedItemsValue
      : enquiry.value_aed || 0;

  const projectPayload: Omit<Project, 'id'> = {
    project_number: projectNumber,
    workspace_id: wsId,
    enquiry_id: enquiry.id || '',
    client_name: enquiry.company_name || enquiry.client_company || 'Client Account',
    client_contact_id: enquiry.contact_id,
    title: enquiry.subject || `Fulfillment for ${enquiry.company_name || enquiry.quote_ref_no || 'Enquiry'}`,
    status: 'In Progress',
    project_type: finalProjectType,
    contract_value: resolvedContractValue,
    currency: enquiry.currency || 'AED',
    line_items: confirmedLineItems,
    operational_notes: operationalNotes,
    assigned_engineer_name: assignedEngineerName || undefined,
    assigned_engineer_id: assignedEngineerId || undefined,
    target_delivery_date: targetDeliveryDate || undefined,
    site_location: siteLocation || undefined,
    milestones: generatedMilestones,
    created_at: nowIso,
    updated_at: nowIso,
    ...overrides
  };

  const res = await safeAddDoc('projects', projectPayload);
  const createdId = res?.id || `prj_${Date.now()}`;
  const createdProject: Project = { id: createdId, ...projectPayload };

  // Tag enquiry with project reference & winning option
  if (enquiry.id) {
    await safeUpdateDoc('enquiries', enquiry.id, {
      project_id: createdId,
      project_number: projectNumber,
      ...(winningOption ? { proposal_option: winningOption } : {}),
      stock_reserved: true,
      stock_reserved_at: nowIso,
      updatedAt: nowIso
    }).catch(() => {});
  }

  // Ensure stock is reserved for inventoried line items if not already tagged (idempotent guard)
  const enquiryForStock: Enquiry = {
    ...enquiry,
    ...(winningOption ? { proposal_option: winningOption } : {})
  };
  if (
    enquiry.stock_reserved !== true &&
    !enquiry.stock_reserved &&
    confirmedLineItems.some(
      (it) => it.product_id || (Array.isArray(it.sub_components) && it.sub_components.some((s) => s.product_id))
    )
  ) {
    try {
      const res = await reserveEnquiryStock(enquiryForStock, user);
      if (res && res.reservedCount > 0) {
        enquiry.stock_reserved = true;
      }
    } catch (resErr) {
      console.warn('Failed auto-reserving stock during createProjectFromEnquiry:', resErr);
    }
  }

  return createdProject;
}

export async function getProjectForEnquiry(enquiryId: string): Promise<Project | null> {
  if (!enquiryId) return null;
  try {
    const snap = await safeGetDocs('projects', where('enquiry_id', '==', enquiryId));
    if (snap && !snap.empty) {
      const activeDoc = snap.docs.find((d) => !d.data().is_deleted);
      if (activeDoc) {
        return { id: activeDoc.id, ...activeDoc.data() } as Project;
      }
    }
  } catch (e) {
    console.warn('Error fetching project for enquiry:', e);
  }
  return null;
}

export async function getWorkspaceProjects(workspaceId: string): Promise<Project[]> {
  if (!workspaceId) return [];
  try {
    const snap = await safeGetDocs('projects', where('workspace_id', '==', workspaceId));
    if (snap && !snap.empty) {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Project))
        .filter((p) => {
          if (p.is_deleted) return false;
          const wId = p.workspace_id || (p as any).workspaceId;
          return wId === workspaceId || (!wId && (workspaceId === 'default' || workspaceId === 'ws_default'));
        })
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      return list;
    }
  } catch (err) {
    console.warn('Error fetching workspace projects:', err);
  }
  return [];
}

export async function getDeletedWorkspaceProjects(workspaceId: string): Promise<Project[]> {
  if (!workspaceId) return [];
  try {
    const snap = await safeGetDocs('projects', where('workspace_id', '==', workspaceId));
    if (snap && !snap.empty) {
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Project))
        .filter((p) => {
          if (!p.is_deleted) return false;
          const wId = p.workspace_id || (p as any).workspaceId;
          return wId === workspaceId || (!wId && (workspaceId === 'default' || workspaceId === 'ws_default'));
        })
        .sort((a, b) => new Date(b.deleted_at || b.updated_at || 0).getTime() - new Date(a.deleted_at || a.updated_at || 0).getTime());
    }
  } catch (err) {
    console.warn('Error fetching deleted workspace projects:', err);
  }
  return [];
}

export async function updateProjectStatus(
  projectId: string,
  status: Project['status'],
  user?: any
): Promise<boolean> {
  if (!projectId) return false;
  const nowIso = new Date().toISOString();
  try {
    const payload: Partial<Project> = {
      status,
      updated_at: nowIso
    };
    if (status === 'Delivered') {
      (payload as any).delivered_at = nowIso;
    } else if (status === 'Completed') {
      (payload as any).completed_at = nowIso;
    }
    await safeUpdateDoc('projects', projectId, payload);
    return true;
  } catch (err) {
    console.error('Failed to update project status:', err);
    return false;
  }
}

export async function updateProjectMetadata(
  projectId: string,
  patch: Partial<Project>
): Promise<boolean> {
  if (!projectId) return false;
  const nowIso = new Date().toISOString();
  try {
    await safeUpdateDoc('projects', projectId, {
      ...patch,
      updated_at: nowIso
    });
    return true;
  } catch (err) {
    console.error('Failed to update project metadata:', err);
    return false;
  }
}

export async function softDeleteProject(
  project: Project,
  parentEnquiry?: Enquiry | null,
  user?: UserProfile | { uid?: string; full_name?: string; username?: string; email?: string } | null
): Promise<boolean> {
  if (!project?.id) return false;
  const nowIso = new Date().toISOString();
  const deletedByName =
    user?.full_name || (user as any)?.username || user?.email || 'System';

  try {
    // 1. Release reserved warehouse stock on parent enquiry or synthesized enquiry from project line items
    const enquiryForRelease: Enquiry = parentEnquiry || ({
      id: project.enquiry_id || project.id,
      workspace_id: project.workspace_id,
      company_name: project.client_name,
      subject: project.title,
      line_items: project.line_items || [],
      stock_reserved: true
    } as any);

    if (project.status !== 'Delivered' && project.status !== 'Completed') {
      try {
        await releaseEnquiryStock(enquiryForRelease, user || undefined);
      } catch (stockErr) {
        console.warn('Non-critical warning releasing stock during project soft-delete:', stockErr);
      }
    }

    // 2. Unlink project_id & project_number on parent enquiry while keeping enquiry commercial status unchanged
    if (project.enquiry_id) {
      await safeUpdateDoc('enquiries', project.enquiry_id, {
        project_id: null,
        project_number: null,
        stock_reserved: false,
        stock_reserved_at: null,
        updatedAt: nowIso
      }).catch(() => {});
    }

    // 3. Soft-delete project document
    await safeUpdateDoc('projects', project.id, {
      is_deleted: true,
      deleted_at: nowIso,
      deleted_by_uid: user?.uid || 'system',
      deleted_by_name: deletedByName,
      updated_at: nowIso
    });

    return true;
  } catch (err) {
    console.error('Failed to soft-delete project:', err);
    return false;
  }
}

export async function restoreProject(project: Project): Promise<boolean> {
  if (!project?.id) return false;
  const nowIso = new Date().toISOString();
  try {
    await safeUpdateDoc('projects', project.id, {
      is_deleted: false,
      deleted_at: null as any,
      deleted_by_uid: null as any,
      deleted_by_name: null as any,
      updated_at: nowIso
    });

    if (project.enquiry_id) {
      await safeUpdateDoc('enquiries', project.enquiry_id, {
        project_id: project.id,
        project_number: project.project_number,
        updatedAt: nowIso
      }).catch(() => {});
    }

    return true;
  } catch (err) {
    console.error('Failed to restore project:', err);
    return false;
  }
}

export async function purgeProjectPermanently(projectId: string): Promise<boolean> {
  if (!projectId) return false;
  try {
    await safeDeleteDoc('projects', projectId);
    return true;
  } catch (err) {
    console.error('Failed to permanently purge project:', err);
    return false;
  }
}



