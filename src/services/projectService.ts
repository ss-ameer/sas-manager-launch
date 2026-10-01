import { Project, Enquiry, UserProfile } from '../types';
import { safeAddDoc, safeGetDocs, safeUpdateDoc } from '../firebase';

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
  overrides?: Partial<Project>
): Promise<Project> {
  const wsId = enquiry.workspace_id || (enquiry as any).workspaceId || 'default';
  const projectNumber = await generateNextProjectNumber(wsId);
  const nowIso = new Date().toISOString();

  const isTurnkey = (enquiry.line_items || []).some(
    (it) =>
      (it.description || '').toLowerCase().includes('installation') ||
      (it.product_type || '').toLowerCase().includes('fabrication')
  );

  const projectPayload: Omit<Project, 'id'> = {
    project_number: projectNumber,
    workspace_id: wsId,
    enquiry_id: enquiry.id || '',
    client_name: enquiry.company_name || enquiry.client_company || 'Client Account',
    client_contact_id: enquiry.contact_id,
    title: enquiry.subject || `Fulfillment for ${enquiry.company_name || enquiry.quote_ref_no || 'Enquiry'}`,
    status: 'In Progress',
    project_type: isTurnkey ? 'Turnkey / Installation' : 'Supply Only',
    contract_value: enquiry.value_aed || 0,
    currency: enquiry.currency || 'AED',
    line_items: enquiry.line_items || [],
    operational_notes: enquiry.remarks || '',
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
      updatedAt: nowIso
    }).catch(() => {});
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

