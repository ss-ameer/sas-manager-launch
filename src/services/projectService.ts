import { Project, ProjectMilestone, Enquiry, UserProfile } from '../types';
import { safeAddDoc, safeGetDocs, safeUpdateDoc } from '../firebase';
import { reserveEnquiryStock } from './inventoryService';

export interface ProjectConversionOptions {
  project_type?: 'Supply Only' | 'Turnkey / Installation';
  assigned_engineer_name?: string;
  assigned_engineer_id?: string;
  target_delivery_date?: string;
  site_location?: string;
  milestones?: ProjectMilestone[];
  operational_notes?: string;
}

export function getDefaultMilestones(projectType: 'Supply Only' | 'Turnkey / Installation'): ProjectMilestone[] {
  if (projectType === 'Turnkey / Installation') {
    return [
      { id: 'm1', title: 'Procurement & Fabrication', status: 'In Progress' },
      { id: 'm2', title: 'Site Delivery', status: 'Pending' },
      { id: 'm3', title: 'Mechanical & Electrical Installation', status: 'Pending' },
      { id: 'm4', title: 'Testing & Wet Commissioning', status: 'Pending' },
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
    const snap = await safeGetDocs('projects');
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

  const isTurnkeyDetected = (enquiry.line_items || []).some(
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

  const projectPayload: Omit<Project, 'id'> = {
    project_number: projectNumber,
    workspace_id: wsId,
    enquiry_id: enquiry.id || '',
    client_name: enquiry.company_name || enquiry.client_company || 'Client Account',
    client_contact_id: enquiry.contact_id,
    title: enquiry.subject || `Fulfillment for ${enquiry.company_name || enquiry.quote_ref_no || 'Enquiry'}`,
    status: 'In Progress',
    project_type: finalProjectType,
    contract_value: enquiry.value_aed || 0,
    currency: enquiry.currency || 'AED',
    line_items: enquiry.line_items || [],
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

  // Tag enquiry with project reference
  if (enquiry.id) {
    await safeUpdateDoc('enquiries', enquiry.id, {
      project_id: createdId,
      project_number: projectNumber,
      stock_reserved: true,
      stock_reserved_at: nowIso,
      updatedAt: nowIso
    }).catch(() => {});
  }

  // Ensure stock is reserved for inventoried line items if not already tagged (idempotent guard)
  if (enquiry.stock_reserved !== true && !enquiry.stock_reserved && enquiry.line_items && enquiry.line_items.some((it) => it.product_id)) {
    try {
      const res = await reserveEnquiryStock(enquiry, user);
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
    const snap = await safeGetDocs('projects');
    if (snap && !snap.empty) {
      const match = snap.docs.find((d) => d.data().enquiry_id === enquiryId);
      if (match) {
        return { id: match.id, ...match.data() } as Project;
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
    const snap = await safeGetDocs('projects');
    if (snap && !snap.empty) {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Project))
        .filter((p) => {
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

