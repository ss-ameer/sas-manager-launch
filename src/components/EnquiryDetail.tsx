import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Enquiry, Company, Contact, AuditLog, UserProfile, Salesperson, Workspace, Attachment, Project, ProjectMilestone, Product, LineItem, QuotationLineItem, DropdownOption, ENQUIRY_STATUS_OPTIONS, normalizeEnquiryStatus, resolveSalespersonIdentifier, resolveSalespersonName, normalizeEnquirySource, PIPELINE_STATUS_GROUPS } from '../types';
import { sanitizeAuditPayload } from '../utils/sanitizeAuditLog';
import { safeUpdateDoc, safeAddDoc } from '../firebase';
import { isRecordOwner, getUserWorkspaceRole, canManageEnquirySharing, canEditEnquiry, canDeleteEnquiry, isCreatorOnlyViewer, canManageWorkspace, isAdmin } from '../utils/permissions';
import TemperatureBadge from './TemperatureBadge';
import { IndustryBadge } from '../utils/taxonomy';
import GoogleSearchButton from './common/GoogleSearchButton';
import HoverScrollText from './common/HoverScrollText';
import { FieldLabel } from './common/FieldHelpHint';
import { buildCatalogVariantAnalysisMap } from '../utils/productVariantFormat';
import { useActivityLauncher, InitiateActivityOptions } from '../context/ActivityLauncherContext';
import { useEntityEdit } from '../context/EntityEditContext';
import { getWhatsAppUrl } from '../utils/defaults';
import FilePreviewModal from './common/FilePreviewModal';
import {
  resolveAttachmentUrl,
  deleteFromSupabaseStorage,
  deleteFromStorageBucket,
  deleteAttachmentBlob,
  uploadToSupabaseStorage,
  dataUrlToFile,
  uploadWorkspaceMediaAsset,
  prepareAttachmentsForSave,
  getAttachmentStorageKey,
  stripCatalogRedundantLineItemMedia,
  rehydrateLineItemsFromCatalog,
  rehydrateDocumentBlobsFromLocal
} from '../services/attachmentStorage';
import { EnquiryRepository } from '../services/repositories/EnquiryRepository';
import { ActivityLogRepository } from '../services/repositories/CallLogRepository';
import { QuotationRepository } from '../services/repositories/QuotationRepository';
import { ProcurementRepository } from '../services/repositories/ProcurementRepository';
import { Quotation, WorkspaceDocumentProfile, CommercialDocumentType, SupplierBill } from '../types';
import { QuotationStudioModal } from './quotations/QuotationStudioModal';
import { QuotationDocument } from './quotations/QuotationDocument';
import { resolvePdfFilename } from '../utils/quotationTokenResolver';
import EnquiryCollaboratorsModal from './EnquiryCollaboratorsModal';
import { CreateCompanyModal } from './companies/CreateCompanyModal';
import SaveToCatalogModal, {
  parseLineItemTitleAndSpec,
  hasCatalogDrift,
  syncLineItemToCatalogProduct,
  compileDescriptionWithSpecs,
  isLineItemPopulated,
  linkLineItemToCatalogProductNonDestructive,
  CatalogSyncMenu
} from './SaveToCatalogModal';
import CompositePackageEditor from './quotations/CompositePackageEditor';
import { cloneLineItemToNextOption, recalculateCompositeItemTotals, isOptionActiveForInventoryAndBaseline } from '../utils/compositeBomUtils';
import LineItemImageOptionsPopover from './common/LineItemImageOptionsPopover';
import ImageLightboxModal from './common/ImageLightboxModal';
import { recordAuditLog } from '../utils/auditLogger';
import { findDuplicateCompany } from '../utils/fuzzyMatch';
import { reserveEnquiryStock, releaseEnquiryStock, isWonStatus, isLostOrCancelledStatus } from '../services/inventoryService';
import { createProjectFromEnquiry, getProjectForEnquiry, getDefaultMilestones, ProjectConversionOptions } from '../services/projectService';
import {
  FileText,
  Building,
  User,
  MapPin,
  Phone,
  Mail,
  ListOrdered,
  Paperclip,
  History,
  RotateCcw,
  Check,
  Cloud,
  UploadCloud,
  Loader2,
  AlertTriangle,
  X,
  Shield,
  Download,
  Trash2,
  Edit2,
  GitFork,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  ChevronsUpDown,
  Copy,
  Link2,
  Search,
  MessageSquare,
  Eye,
  Image as ImageIcon,
  Users,
  UserPlus,
  FolderPlus,
  Boxes,
  PackageCheck,
  ExternalLink,
  Calendar,
  Truck,
  Wrench,
  Package,
  Printer,
  CheckCircle2,
  XCircle,
  Plus,
  ArrowUp,
  ArrowDown,
  Save,
  DollarSign,
  FileCheck,
  RefreshCw,
  MoreHorizontal
} from 'lucide-react';

interface EnquiryDetailProps {
  enquiry: Enquiry;
  companies: Company[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  contacts: Contact[];
  auditLogs: AuditLog[];
  salespersons: Salesperson[];
  products?: Product[];
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  productCategories?: DropdownOption[];
  units?: DropdownOption[];
  setProductCategories?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  user: UserProfile;
  enquiries?: Enquiry[];
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  onUpdateEnquiry?: (enquiry: Enquiry) => void;
  activeWorkspace?: Workspace;
  activeWorkspaceId?: string;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onClose: () => void;
  onNavigateToProject?: (projectId: string) => void;
  onDeleteEnquiry: (id: string) => void;
  onEditEnquiry: (enquiry: Enquiry) => void;
  onSelectEnquiry?: (id: string) => void;
  onOpenActivityDrawer?: (context: {
    companyId?: string;
    companyName?: string;
    contactId?: string;
    contactName?: string;
    contactPhone?: string;
    enquiryId?: string;
    channel?: 'Call' | 'WhatsApp' | 'Email' | 'Meeting' | 'Site Visit' | string;
    initialStatus?: string;
    existingLog?: any;
    logToEdit?: any;
  }) => void;
  onInitiateActivity?: (options: InitiateActivityOptions) => void;
  onStockUpdated?: () => void;
  autoOpenStudio?: boolean;
  onAutoOpenStudioConsumed?: () => void;
}

export default function EnquiryDetail({
  enquiry,
  companies,
  setCompanies,
  contacts,
  auditLogs,
  salespersons,
  products = [],
  setProducts,
  productCategories = [],
  units = [],
  setProductCategories,
  user,
  enquiries = [],
  setEnquiries,
  onUpdateEnquiry,
  activeWorkspace,
  activeWorkspaceId,
  onClose,
  onNavigateToProject,
  onDeleteEnquiry,
  onEditEnquiry,
  onSelectEnquiry,
  onOpenActivityDrawer,
  onInitiateActivity,
  onStockUpdated,
  triggerToast,
  autoOpenStudio,
  onAutoOpenStudioConsumed
}: EnquiryDetailProps) {
  const { openEditCompany, openEditContact } = useEntityEdit();
  const launcher = useActivityLauncher();
  const handleInitiate = onInitiateActivity || launcher.initiateActivity;
  const [currentEnquiry, setCurrentEnquiry] = useState<Enquiry>(enquiry);
  const [activeTab, setActiveTab] = useState<'details' | 'items' | 'history' | 'revisions'>('details');
  const [reverting, setReverting] = useState(false);
  const [revertSuccess, setRevertSuccess] = useState(false);
  const [isExpandedWidth, setIsExpandedWidth] = useState(false);
  const [expandedItemIndices, setExpandedItemIndices] = useState<Record<number, boolean>>({});
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [promotingAttachmentKey, setPromotingAttachmentKey] = useState<string | null>(null);
  const [deletingAttachmentKey, setDeletingAttachmentKey] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [activeOptionTab, setActiveOptionTab] = useState<string>('ALL');

  // Inline Line Items Editor & Quick Catalog Add states
  const [isInlineEditingItems, setIsInlineEditingItems] = useState(false);
  const [draftLineItems, setDraftLineItems] = useState<LineItem[]>(() =>
    rehydrateLineItemsFromCatalog(enquiry.line_items || [], products)
  );
  const [isSavingInlineItems, setIsSavingInlineItems] = useState(false);
  const [showQuickCatalogPicker, setShowQuickCatalogPicker] = useState(false);
  const [quickCatalogSearch, setQuickCatalogSearch] = useState('');
  const [quickCatalogCategory, setQuickCatalogCategory] = useState('ALL');
  const [quickCatalogStockFilter, setQuickCatalogStockFilter] = useState<'all' | 'in_stock' | 'low_stock'>('all');
  const [saveToCatalogState, setSaveToCatalogState] = useState<{
    isOpen: boolean;
    item: any;
    itemIndex: number;
    isFromDraft: boolean;
  }>({ isOpen: false, item: null, itemIndex: -1, isFromDraft: false });
  const [syncingCatalogIdx, setSyncingCatalogIdx] = useState<number | null>(null);
  const [uploadingInlineItemMedia, setUploadingInlineItemMedia] = useState<{ idx: number; type: 'image' | 'datasheet' } | null>(null);
  const [showQuoteSyncPrompt, setShowQuoteSyncPrompt] = useState(false);
  const [isSyncingQuoteItems, setIsSyncingQuoteItems] = useState(false);
  const [isUploadingDetailAttachment, setIsUploadingDetailAttachment] = useState(false);
  const [lightboxItemState, setLightboxItemState] = useState<{
    origIdx: number;
    item: LineItem;
    matchedProduct?: Product;
  } | null>(null);

  // Synchronize local enquiry when prop updates
  useEffect(() => {
    const hydratedItems = rehydrateLineItemsFromCatalog(enquiry.line_items || [], products);
    const initialEnq = { ...enquiry, line_items: hydratedItems };
    setCurrentEnquiry(initialEnq);
    setDraftLineItems(hydratedItems);
    setIsInlineEditingItems(false);
    setShowQuoteSyncPrompt(false);
    setActiveOptionTab('ALL');
    rehydrateDocumentBlobsFromLocal(initialEnq)
      .then((rehydrated) => {
        if (rehydrated) {
          const finalItems = rehydrateLineItemsFromCatalog(rehydrated.line_items || [], products);
          setCurrentEnquiry({ ...rehydrated, line_items: finalItems });
          setDraftLineItems(finalItems);
        }
      })
      .catch(() => {});
  }, [enquiry, products]);

  // Project linkage & Inventory Reservation States
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [isCreatingProject, setIsCreatingProject] = useState<boolean>(false);
  const [linkedProject, setLinkedProject] = useState<Project | null>(null);

  // Quotation Studio & Commercial Documents Hub State
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [workspaceSupplierBills, setWorkspaceSupplierBills] = useState<SupplierBill[]>([]);
  const [isQuotationStudioOpen, setIsQuotationStudioOpen] = useState<boolean>(false);
  const [viewingQuotation, setViewingQuotation] = useState<Quotation | null>(null);
  const [showBulkApplyPopover, setShowBulkApplyPopover] = useState<boolean>(false);
  const [bulkDeliveryInput, setBulkDeliveryInput] = useState<string>('');
  const [bulkOriginInput, setBulkOriginInput] = useState<string>('');

  // On-demand rehydration of IndexedDB blobs (logo, seal, signatures, line item media, flyer annexes) for viewing & quick-printing
  useEffect(() => {
    if (viewingQuotation?.id) {
      let active = true;
      rehydrateDocumentBlobsFromLocal(viewingQuotation)
        .then((rehydrated) => {
          if (active && rehydrated) {
            setViewingQuotation((prev) => (prev?.id === viewingQuotation.id ? { ...prev, ...rehydrated } : prev));
          }
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }
  }, [viewingQuotation?.id]);
  const [documentProfile, setDocumentProfile] = useState<WorkspaceDocumentProfile | null>(null);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [docHubFilter, setDocHubFilter] = useState<'all' | CommercialDocumentType>('all');
  const [poModalState, setPoModalState] = useState<{
    isOpen: boolean;
    sourceQuote: Quotation | null;
    poVariant: 'supplier_po' | 'order_acknowledgment';
    supplierCompanyId: string;
    supplierName: string;
    supplierContact: string;
    supplierEmail: string;
    supplierPhone: string;
    supplierAddress: string;
    supplierTrn: string;
    shippingDestination: 'Warehouse' | 'Direct to Client Site' | 'Custom';
    incoterms: 'Ex-Works' | 'FOB' | 'CIF' | 'DDP' | 'DAP';
    selectedItemIndices: number[];
  }>({
    isOpen: false,
    sourceQuote: null,
    poVariant: 'supplier_po',
    supplierCompanyId: '',
    supplierName: '',
    supplierContact: '',
    supplierEmail: '',
    supplierPhone: '',
    supplierAddress: '',
    supplierTrn: '',
    shippingDestination: 'Warehouse',
    incoterms: 'Ex-Works',
    selectedItemIndices: []
  });

  // Fork a new quotation revision from an existing quotation and open inside QuotationStudioModal
  const handleCreateQuotationRevision = async (sourceQuote: Quotation) => {
    try {
      const nextRev = await QuotationRepository.createRevision(sourceQuote.id!);
      setQuotations((prev) => [
        nextRev,
        ...prev.map((item) =>
          item.id === sourceQuote.id ? { ...item, status: 'Superseded' as const } : item
        )
      ]);
      setViewingQuotation(null);
      setEditingQuotation(nextRev);
      setIsQuotationStudioOpen(true);
      if (triggerToast) {
        triggerToast(`Forked new revision ${nextRev.formatted_quote_ref} draft`, 'success');
      }
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(err?.message || 'Failed to create revision', 'error');
      }
    }
  };

  // Prompt confirmation to mark quotation as Client Accepted & Win Enquiry
  const promptAcceptQuotation = (quote: Quotation) => {
    const quoteItems = quote.line_items || [];
    const distinctQuoteOptions = Array.from(
      new Set([
        ...quoteItems
          .map((li) => (li.option_group || '').trim())
          .filter((g) => g && g !== 'Default / Included' && g !== 'Baseline / All' && !g.toLowerCase().includes('optional')),
        ...(currentEnquiry.line_items || [])
          .map((li) => ((li as any).option_designation || li.option || '').trim())
          .filter((g) => g && g !== 'Default / Included' && g !== 'Baseline / All' && !g.toLowerCase().includes('optional'))
      ])
    );

    const initialWinningOption =
      distinctQuoteOptions.length > 0
        ? (currentEnquiry.proposal_option || distinctQuoteOptions[0])
        : undefined;

    setConfirmDialog({
      isOpen: true,
      title: 'Accept Commercial Offer & Confirm Order',
      message: `Mark ${quote.formatted_quote_ref} as Client Accepted? This will update the enquiry status to Won / Approved, reserve applicable stock, and sync the deal value.`,
      confirmText: 'Accept Quote / Won',
      cancelText: 'Cancel',
      variant: 'success',
      selectableOptions: distinctQuoteOptions.length > 1 ? distinctQuoteOptions : undefined,
      selectedOption: initialWinningOption,
      onConfirm: (chosenOpt?: string) => handleAcceptQuotation(quote, chosenOpt || initialWinningOption)
    });
  };

  const handleAcceptQuotation = async (quote: Quotation, chosenOption?: string) => {
    if (!currentEnquiry?.id || !quote.id) return;
    try {
      // 1. Update quotation status to 'Approved'
      await QuotationRepository.acceptQuotation(quote.id);
      setQuotations((prev) =>
        prev.map((q) => (q.id === quote.id ? { ...q, status: 'Approved' as const } : q))
      );
      if (viewingQuotation && viewingQuotation.id === quote.id) {
        setViewingQuotation({ ...viewingQuotation, status: 'Approved' });
      }

      // Prompt or resolve winning option if quotation/enquiry has multiple option groups
      const quoteItems = quote.line_items || [];
      const distinctQuoteOptions = Array.from(
        new Set(
          quoteItems
            .map((li) => (li.option_group || '').trim())
            .filter((g) => g && g !== 'Default / Included' && g !== 'Baseline / All' && !g.toLowerCase().includes('optional'))
        )
      );
      const selectedWinningOption =
        chosenOption ||
        (distinctQuoteOptions.length > 0
          ? (currentEnquiry.proposal_option || distinctQuoteOptions[0])
          : currentEnquiry.proposal_option);

      // 2. Sync deal value, status, and quote ref to parent enquiry (converting USD -> AED if needed)
      const syncedLineItems = quoteItems
        .filter((li) => isOptionActiveForInventoryAndBaseline(li.option_group, selectedWinningOption))
        .map((li) => ({
          ...li,
          is_optional: (li.option_group || '').toLowerCase().includes('optional') ? Boolean(li.is_optional) : false
        }));
      const acceptedTotals = QuotationRepository.calculateTotals(
        syncedLineItems,
        quote.freight_amount,
        quote.tax_mode,
        quote.tax_rate_percent
      );
      const rawGrandTotal =
        syncedLineItems.length > 0 ? acceptedTotals.grand_total : Number(quote.grand_total || 0);
      const dealValueAed = quote.currency === 'USD' ? Math.round(rawGrandTotal * 3.6725 * 100) / 100 : rawGrandTotal;
      let updatedEnquiry = await EnquiryRepository.syncAcceptedQuotation(
        currentEnquiry.id,
        quote.formatted_quote_ref,
        dealValueAed,
        user ? { uid: user.uid, name: user.full_name || user.username } : undefined,
        selectedWinningOption
      );

      // Auto-reserve stock if applicable upon transition to Won
      try {
        const baseEnquiryForReserve = updatedEnquiry || {
          ...currentEnquiry,
          ...(selectedWinningOption ? { proposal_option: selectedWinningOption } : {})
        };
        const resResult = await reserveEnquiryStock(baseEnquiryForReserve, user);
        if (resResult.reservedCount > 0) {
          const reservedNow = new Date().toISOString();
          updatedEnquiry = {
            ...baseEnquiryForReserve,
            stock_reserved: true,
            stock_reserved_at: reservedNow
          };
          await EnquiryRepository.save(updatedEnquiry);
        }
        if (onStockUpdated) {
          onStockUpdated();
        }
      } catch (stockErr) {
        console.warn('[EnquiryDetail] Stock auto-reserve notice:', stockErr);
      }

      if (updatedEnquiry) {
        setCurrentEnquiry(updatedEnquiry);
        if (onUpdateEnquiry) {
          onUpdateEnquiry(updatedEnquiry);
        }
      }

      // 3. Record immutable activity timeline entry
      try {
        const activityId = `act_quote_won_${Date.now()}`;
        const wsId = currentEnquiry.workspace_id || activeWorkspaceId || 'ws_default';
        const formattedVal = `AED ${dealValueAed.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        const noteText = `Commercial Offer ${quote.formatted_quote_ref} Accepted by Client. Confirmed Value: ${formattedVal}`;

        await ActivityLogRepository.save({
          id: activityId,
          workspace_id: wsId,
          company_id: currentEnquiry.company_id || '',
          contact_id: currentEnquiry.contact_id || '',
          enquiry_id: currentEnquiry.id,
          enquiry_quote_ref: quote.formatted_quote_ref,
          channel: 'Email',
          status: 'Completed',
          outcome: 'Order Received',
          notes: noteText,
          logged_by: user?.full_name || user?.username || 'User',
          date: new Date().toISOString()
        });

        // Also record an audit_logs document so it shows in the audit timeline
        const auditPayload = sanitizeAuditPayload({
          workspace_id: wsId,
          user_id: user?.uid || 'system',
          user_name: user?.full_name || user?.username || 'User',
          action: 'UPDATE',
          target_entity: 'ENQUIRY',
          target_id: currentEnquiry.id,
          timestamp: new Date().toISOString(),
          changes: [
            {
              field: 'quotation_acceptance',
              old_value: currentEnquiry.status,
              new_value: noteText
            }
          ]
        });
        await safeAddDoc('audit_logs', auditPayload);
      } catch (actErr) {
        console.warn('[EnquiryDetail] Failed creating activity log for accepted quote:', actErr);
      }

      if (triggerToast) {
        triggerToast(
          `Quotation ${quote.formatted_quote_ref} Accepted! Enquiry marked Won / Order Confirmed with value AED ${dealValueAed.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
          'success'
        );
      }
    } catch (err: any) {
      console.error('Failed to accept quotation:', err);
      if (triggerToast) {
        triggerToast(err?.message || 'Failed to accept quotation', 'error');
      }
    }
  };

  // Decline Quotation / Mark as Lost Modal State & Handlers
  const [declineModalState, setDeclineModalState] = useState<{
    isOpen: boolean;
    quotation: Quotation | null;
    reason: string;
    notes: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    quotation: null,
    reason: 'Price / Competitor Cheaper',
    notes: '',
    isSubmitting: false
  });

  const openDeclineModal = (quote: Quotation) => {
    setDeclineModalState({
      isOpen: true,
      quotation: quote,
      reason: 'Price / Competitor Cheaper',
      notes: '',
      isSubmitting: false
    });
  };

  const handleConfirmDecline = async () => {
    const quote = declineModalState.quotation;
    if (!quote?.id || !currentEnquiry?.id) return;

    setDeclineModalState((prev) => ({ ...prev, isSubmitting: true }));
    try {
      const reason = declineModalState.reason;
      const notes = declineModalState.notes.trim();

      // 1. Update quotation status to 'Declined' in repository
      await QuotationRepository.declineQuotation(quote.id, reason, notes);
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === quote.id
            ? { ...q, status: 'Declined' as const, decline_reason: reason, decline_notes: notes }
            : q
        )
      );
      if (viewingQuotation && viewingQuotation.id === quote.id) {
        setViewingQuotation({
          ...viewingQuotation,
          status: 'Declined',
          decline_reason: reason,
          decline_notes: notes
        });
      }

      // 2. Sync parent enquiry status to 'Lost / Cancelled'
      const updatedEnquiry = await EnquiryRepository.syncDeclinedQuotation(
        currentEnquiry.id,
        quote.formatted_quote_ref,
        reason,
        notes,
        user ? { uid: user.uid, name: user.full_name || user.username } : undefined
      );

      if (updatedEnquiry) {
        setCurrentEnquiry(updatedEnquiry);
        if (onUpdateEnquiry) {
          onUpdateEnquiry(updatedEnquiry);
        }
      }

      // Auto-release stock if applicable upon transition to Lost / Cancelled
      try {
        await releaseEnquiryStock(currentEnquiry, user);
        if (onStockUpdated) {
          onStockUpdated();
        }
      } catch (stockErr) {
        console.warn('[EnquiryDetail] Stock auto-release notice:', stockErr);
      }

      // 3. Record immutable activity timeline entry & audit log
      const wsId = currentEnquiry.workspace_id || activeWorkspaceId || 'ws_default';
      const logNote = `Commercial Offer ${quote.formatted_quote_ref} Declined by Client. Reason: ${reason}. Notes: ${notes || 'None'}`;

      try {
        const activityId = `act_quote_declined_${Date.now()}`;
        await ActivityLogRepository.save({
          id: activityId,
          workspace_id: wsId,
          company_id: currentEnquiry.company_id || '',
          contact_id: currentEnquiry.contact_id || '',
          enquiry_id: currentEnquiry.id,
          enquiry_quote_ref: quote.formatted_quote_ref,
          channel: 'Email',
          status: 'Completed',
          outcome: 'Lost',
          notes: logNote,
          logged_by: user?.full_name || user?.username || 'User',
          date: new Date().toISOString()
        });

        const auditPayload = sanitizeAuditPayload({
          workspace_id: wsId,
          user_id: user?.uid || 'system',
          user_name: user?.full_name || user?.username || 'User',
          action: 'UPDATE',
          target_entity: 'ENQUIRY',
          target_id: currentEnquiry.id,
          timestamp: new Date().toISOString(),
          changes: [
            {
              field: 'quotation_declined',
              old_value: currentEnquiry.status,
              new_value: logNote
            }
          ]
        });
        await safeAddDoc('audit_logs', auditPayload);
      } catch (actErr) {
        console.warn('[EnquiryDetail] Failed logging activity for declined quote:', actErr);
      }

      setDeclineModalState((prev) => ({ ...prev, isOpen: false, isSubmitting: false }));
      if (triggerToast) {
        triggerToast(
          `Quotation ${quote.formatted_quote_ref} marked as Declined. Enquiry set to Lost / Cancelled.`,
          'info'
        );
      }
    } catch (err: any) {
      console.error('Failed to decline quotation:', err);
      setDeclineModalState((prev) => ({ ...prev, isSubmitting: false }));
      if (triggerToast) {
        triggerToast(err?.message || 'Failed to decline quotation', 'error');
      }
    }
  };

  // Delete / Discard Quotation or Revision Handler (Soft-delete & Revision Fallback)
  const promptDeleteQuotation = (quote: Quotation) => {
    const isDraft = quote.status === 'Draft' || !quote.status;
    const isApproved = quote.status === 'Approved';

    setConfirmDialog({
      isOpen: true,
      title: isDraft ? 'Discard Draft Quotation' : isApproved ? 'Delete Approved Quotation' : 'Delete Quotation Revision',
      message: isApproved
        ? `Quotation ${quote.formatted_quote_ref} is currently marked as Approved/Won. Deleting it will remove the formal document and move it to the Recycle Bin, but will NOT cancel or change your Enquiry deal status. Do you wish to proceed?`
        : isDraft
        ? `Are you sure you want to discard draft quotation ${quote.formatted_quote_ref}? It will be removed from this enquiry and moved to the Recycle Bin.`
        : `Are you sure you want to delete quotation revision ${quote.formatted_quote_ref}? If this revision superseded an earlier quote, the earlier revision will be restored as active. It will be moved to the Recycle Bin.`,
      confirmText: isDraft ? 'Discard Draft' : 'Delete to Recycle Bin',
      cancelText: 'Keep Quotation',
      isDestructive: true,
      variant: 'destructive',
      onConfirm: () => handleDeleteQuotation(quote)
    });
  };

  const handleDeleteQuotation = async (quote: Quotation) => {
    if (!quote.id) return;
    try {
      const actor = {
        id: user?.uid || user?.id || 'unknown',
        name: user?.full_name || user?.name || user?.username || user?.email || 'User'
      };

      await QuotationRepository.softDeleteQuotation(quote.id, actor);

      // If viewing this quotation in preview modal, close it
      if (viewingQuotation && viewingQuotation.id === quote.id) {
        setViewingQuotation(null);
      }

      // If currently editing this quotation in studio, close it
      if (editingQuotation && editingQuotation.id === quote.id) {
        setEditingQuotation(null);
        setIsQuotationStudioOpen(false);
      }

      // Refresh quotations list from repository to accurately reflect revision fallback
      const wsId = currentEnquiry.workspace_id || currentEnquiry.workspaceId || 'ws_default';
      const updatedQuotes = await QuotationRepository.getQuotationsForEnquiry(currentEnquiry.id, wsId);
      setQuotations(updatedQuotes);

      // Deal Value Sync & R0 Discard Safety (STRICTLY for client 'quotation' documents only — never outbound PO/PV/MRN/DN):
      const isClientQuote = !quote.document_type || quote.document_type === 'quotation';
      if (isClientQuote) {
        const activeQuotes = updatedQuotes.filter(
          (q) => !q.is_deleted && (!q.document_type || q.document_type === 'quotation')
        );
        const fallbackActive =
          activeQuotes.find((q) => q.status === 'Approved') ||
          activeQuotes.find((q) => q.status === 'Sent') ||
          activeQuotes.find((q) => q.status === 'Draft') ||
          (activeQuotes.length > 0 ? activeQuotes[0] : null);

        if (fallbackActive) {
          const rawSub = Number(fallbackActive.subtotal ?? fallbackActive.grand_total ?? 0);
          const newTotal = fallbackActive.currency === 'USD' ? Math.round(rawSub * 3.6725 * 100) / 100 : rawSub;
          const newRef = fallbackActive.formatted_quote_ref;
          setCurrentEnquiry((prev) => (prev ? { ...prev, value_aed: newTotal, quote_ref_no: newRef } : prev));
          if (onUpdateEnquiry) {
            onUpdateEnquiry({ ...currentEnquiry, value_aed: newTotal, quote_ref_no: newRef });
          }
        } else {
          // Root Revision (R0) Discard: No remaining active quotes; fallback to line items total
          const fallbackValue = (currentEnquiry.line_items || []).reduce(
            (sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0),
            0
          );
          setCurrentEnquiry((prev) => (prev ? { ...prev, value_aed: fallbackValue } : prev));
          if (onUpdateEnquiry) {
            onUpdateEnquiry({ ...currentEnquiry, value_aed: fallbackValue });
          }
        }
      }

      if (triggerToast) {
        triggerToast(
          `Document ${quote.formatted_quote_ref} ${quote.status === 'Draft' ? 'discarded' : 'moved to Recycle Bin'}.`,
          'info'
        );
      }
    } catch (err: any) {
      console.error('Failed to delete quotation:', err);
      if (triggerToast) {
        triggerToast(err?.message || 'Failed to delete quotation', 'error');
      }
    }
  };

  // Self-heal any enquiry whose quote_ref_no or latest_quote_ref was previously polluted with an auxiliary prefix (e.g. DO-TEST/10/2026/5-01-R1)
  useEffect(() => {
    const rawRef = currentEnquiry?.quote_ref_no || '';
    const rawLatest = (currentEnquiry as any)?.latest_quote_ref || '';
    const cleanRef = QuotationRepository.sanitizeCanonicalQuoteRef(rawRef);
    const cleanLatest = QuotationRepository.sanitizeCanonicalQuoteRef(rawLatest);
    if ((rawRef && cleanRef && rawRef !== cleanRef) || (rawLatest && cleanLatest && rawLatest !== cleanLatest)) {
      const nextQuoteRef = cleanRef || cleanLatest;
      setCurrentEnquiry((prev) =>
        prev
          ? {
              ...prev,
              quote_ref_no: nextQuoteRef,
              latest_quote_ref: cleanLatest || nextQuoteRef
            }
          : prev
      );
      if (currentEnquiry?.id) {
        safeUpdateDoc('enquiries', currentEnquiry.id, {
          quote_ref_no: nextQuoteRef,
          latest_quote_ref: cleanLatest || nextQuoteRef
        }).catch(() => {});
      }
      if (onUpdateEnquiry) {
        onUpdateEnquiry({
          ...currentEnquiry,
          quote_ref_no: nextQuoteRef,
          latest_quote_ref: cleanLatest || nextQuoteRef
        });
      }
    }
  }, [currentEnquiry?.id, currentEnquiry?.quote_ref_no]);

  // Load Workspace Document Profile for quotation rendering
  useEffect(() => {
    let isMounted = true;
    const wsId = currentEnquiry.workspace_id || activeWorkspaceId || 'ws_default';
    QuotationRepository.getWorkspaceDocumentProfile(wsId)
      .then((prof) => {
        if (isMounted) {
          setDocumentProfile(prof);
        }
      })
      .catch((err) => {
        console.warn('[EnquiryDetail] Failed fetching workspace document profile:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [currentEnquiry?.workspace_id, activeWorkspaceId]);

  const [loadedQuotationsEnquiryId, setLoadedQuotationsEnquiryId] = useState<string | null>(null);

  // Load Quotations & Supplier Bills for this enquiry
  useEffect(() => {
    let isMounted = true;
    const wsId = currentEnquiry.workspace_id || activeWorkspaceId || 'ws_default';
    if (currentEnquiry?.id) {
      QuotationRepository.getQuotationsForEnquiry(currentEnquiry.id, wsId)
        .then((quotes) => {
          if (isMounted) {
            setQuotations(quotes);
            setLoadedQuotationsEnquiryId(currentEnquiry.id);
          }
        })
        .catch((err) => {
          console.warn('[EnquiryDetail] Failed fetching quotations:', err);
          if (isMounted) {
            setLoadedQuotationsEnquiryId(currentEnquiry.id);
          }
        });
      ProcurementRepository.getWorkspaceSupplierBills(wsId)
        .then((bills) => {
          if (isMounted) {
            setWorkspaceSupplierBills(bills);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [currentEnquiry?.id, currentEnquiry?.workspace_id, activeWorkspaceId]);

  // Enquiry Procurement & Actual Margin Rollup
  const enquiryProcurementRollup = useMemo(() => {
    const estCostAed = (currentEnquiry.line_items || []).reduce((sum, li) => {
      const qty = Number(li.quantity) || 1;
      const unitCost = Number(li.cost_price) || 0;
      return sum + qty * unitCost;
    }, 0);
    return ProcurementRepository.computeProcurementRollup({
      enquiryId: currentEnquiry.id,
      projectId: currentEnquiry.project_id,
      clientContractValueAed: Number(currentEnquiry.value_aed) || 0,
      estimatedCatalogCostAed: estCostAed,
      procurementDocs: quotations.filter((q) => !q.is_deleted),
      supplierBills: workspaceSupplierBills
    });
  }, [
    currentEnquiry.id,
    currentEnquiry.project_id,
    currentEnquiry.value_aed,
    currentEnquiry.line_items,
    quotations,
    workspaceSupplierBills
  ]);

  const catalogVariantAnalysisMap = useMemo(
    () => buildCatalogVariantAnalysisMap(products || []),
    [products]
  );

  // Helper to build QuotationLineItems from an enquiry or source quotation
  const buildBaseLineItemsFromSource = (sourceQuote?: Quotation | null, sourceEnquiry?: Enquiry): QuotationLineItem[] => {
    if (sourceQuote?.line_items && sourceQuote.line_items.length > 0) {
      return sourceQuote.line_items.map((it) => ({ ...it }));
    }
    const targetEnq = sourceEnquiry || currentEnquiry;
    return (targetEnq.line_items || []).map((li, idx) => {
      const qty = Number(li.quantity) || 1;
      const rate = Number(li.unit_price) || 0;
      const rawOpt = String((li as any).option_designation || li.option || '').trim();
      const isOptionalOrAlt =
        rawOpt.toLowerCase().includes('optional') ||
        rawOpt.toLowerCase().includes('add-on') ||
        /option\s+[b-z]/i.test(rawOpt);
      return {
        id: li.id || `item_${idx}`,
        sn: idx + 1,
        product_id: li.product_id,
        sku: li.sku,
        item_name: li.item_name || li.product_type || `Item #${idx + 1}`,
        description: li.description || '',
        quantity: qty,
        unit: li.unit || 'pcs',
        unit_price: rate,
        cost_price: li.cost_price,
        total_price: QuotationRepository.roundCurrency(qty * rate),
        line_total: QuotationRepository.roundCurrency(qty * rate),
        brand_make: li.brand_make,
        model_part_no: li.model_part_no,
        country_of_origin: li.country_of_origin,
        hs_code: li.hs_code,
        availability:
          (li.lead_time_note && li.lead_time_note !== 'Ex-Stock / Standard' ? li.lead_time_note : '') ||
          ((li as any).availability && (li as any).availability !== 'Ex-Stock / Standard' ? (li as any).availability : '') ||
          currentEnquiry.delivery_period ||
          li.lead_time_note ||
          (li as any).availability ||
          'Ex-Stock / Standard',
        lead_time_note:
          (li.lead_time_note && li.lead_time_note !== 'Ex-Stock / Standard' ? li.lead_time_note : '') ||
          ((li as any).availability && (li as any).availability !== 'Ex-Stock / Standard' ? (li as any).availability : '') ||
          currentEnquiry.delivery_period ||
          li.lead_time_note ||
          (li as any).availability ||
          'Ex-Stock / Standard',
        option: rawOpt || undefined,
        option_group: rawOpt && rawOpt !== 'Default / Included' && rawOpt !== 'Baseline / All' ? rawOpt : undefined,
        is_optional: isOptionalOrAlt,
        attributes: li.attributes || [],
        image_url: li.image_url,
        secondary_image_url: li.secondary_image_url,
        image_caption: li.image_caption,
        secondary_image_caption: li.secondary_image_caption,
        image_adjustments: li.image_adjustments,
        image_display_override: li.image_display_override,
        image_size_override: li.image_size_override,
        image_aspect_override: li.image_aspect_override,
        datasheet_attachment: li.datasheet_attachment,
        include_datasheet_in_quote: li.include_datasheet_in_quote !== false,
        is_composite_set: li.is_composite_set,
        sub_components: li.sub_components,
        package_pricing_mode: li.package_pricing_mode
      };
    });
  };

  // Helper to synthesize a Quotation representation from an Enquiry record (baseline proposal or linked sheet revision)
  const buildSynthesizedQuotationFromEnquiry = (targetEnq: Enquiry, revNumOverride?: number): Quotation => {
    const revNum = revNumOverride ?? Math.max(1, Number(targetEnq.revision_number) || 1);
    const rawRef = QuotationRepository.sanitizeCanonicalQuoteRef(
      targetEnq.quote_ref_no ||
        `QT-${new Date().getFullYear()}-${String(targetEnq.sn || 1).padStart(4, '0')}`
    );
    const baseRef = rawRef.replace(/-R\d+$/i, '');
    const formattedRef = /-R\d+$/i.test(rawRef) ? rawRef : `${baseRef}-R${revNum}`;
    const comp = companies.find((c) => c.id === targetEnq.company_id);
    const cont = contacts.find((c) => c.id === targetEnq.contact_id);
    const synthItems = buildBaseLineItemsFromSource(null, targetEnq);
    const effectiveTaxMode = targetEnq.tax_mode || 'taxes_extra';
    const calcTotals = QuotationRepository.calculateTotals(synthItems, 0, effectiveTaxMode, 5);
    const hasItems = synthItems.length > 0 && !targetEnq.is_lump_sum;
    const rawValAed = Number(targetEnq.value_aed || 0);
    const isUSD = targetEnq.currency === 'USD';
    const fallbackSub = isUSD ? Math.round((rawValAed / 3.6725) * 100) / 100 : rawValAed;
    const subTotal = hasItems ? calcTotals.subtotal : fallbackSub;
    const taxAmt = hasItems ? calcTotals.tax_amount : Math.round(subTotal * 0.05 * 100) / 100;
    const grandTotal = hasItems ? calcTotals.grand_total : Math.round((subTotal + taxAmt) * 100) / 100;
    const derivedStatus: Quotation['status'] = isWonStatus(targetEnq.status)
      ? 'Approved'
      : isLostOrCancelledStatus(targetEnq.status)
      ? 'Declined'
      : targetEnq.status === 'Sent'
      ? 'Sent'
      : 'Draft';

    const effectiveValidityDays = Number(targetEnq.validity_days) > 0 ? Number(targetEnq.validity_days) : 30;
    const resolvedSpName = resolveSalespersonName(targetEnq, salespersons) || user?.full_name || user?.username || '';

    const synth: Quotation = {
      id: `baseline_${targetEnq.id || targetEnq.sn || 'current'}_r${revNum}`,
      workspace_id: targetEnq.workspace_id || activeWorkspaceId || 'ws_default',
      enquiry_id: targetEnq.id || currentEnquiry.id || '',
      document_type: 'quotation',
      quote_number: baseRef,
      revision_number: revNum,
      formatted_quote_ref: formattedRef,
      status: derivedStatus,
      created_at: targetEnq.enquiry_date || targetEnq.createdAt || new Date().toISOString(),
      valid_until: targetEnq.valid_until || new Date(Date.now() + effectiveValidityDays * 86400000).toISOString(),
      sender_snapshot: {
        entity_name: documentProfile?.legal_entity_name || documentProfile?.legal_name || activeWorkspace?.name || 'Aventura Components FZE',
        legal_name: documentProfile?.legal_name || activeWorkspace?.name || 'Aventura Components FZE',
        tagline: documentProfile?.tagline || '',
        address: documentProfile?.address || '',
        trn: documentProfile?.trn || '',
        phone: documentProfile?.phone || '',
        email: documentProfile?.email || '',
        website: documentProfile?.website || '',
        logo_url: documentProfile?.logo_url || ''
      },
      client_snapshot: {
        company_id: comp?.id || targetEnq.company_id,
        entity_name: comp?.display_name || targetEnq.company_name || 'Valued Client',
        contact_person: cont?.full_name || targetEnq.contact_person_name || (targetEnq as any).contact_name || '',
        address: [comp?.address, comp?.city || targetEnq.project_location, comp?.country || targetEnq.country]
          .filter(Boolean)
          .join(', '),
        trn: comp?.tax_registration_no || '',
        phone: cont?.mobile || cont?.phone || comp?.general_phone || '',
        email: cont?.email || comp?.general_email || ''
      },
      subject: targetEnq.subject || `Commercial Proposal — Ref ${formattedRef}`,
      currency: (targetEnq.currency as 'AED' | 'USD') || 'AED',
      line_items: synthItems,
      subtotal: subTotal,
      freight_amount: 0,
      tax_mode: effectiveTaxMode,
      tax_rate_percent: 5,
      tax_amount: taxAmt,
      grand_total: grandTotal,
      payment_terms: targetEnq.payment_terms || '100% Advance / As Agreed',
      price_basis: targetEnq.price_basis || 'Ex-Works Warehouse',
      delivery_period: targetEnq.delivery_period || undefined,
      validity_days: effectiveValidityDays,
      prepared_by: resolvedSpName,
      signatories: []
    };
    (synth as any)._isBaselineEnquiryProposal = true;
    (synth as any)._linkedEnquiryId = targetEnq.id;
    return synth;
  };

  // Unified Commercial Documents Hub list: merges saved formal documents (QT, DO, PO, REC, PV, MRN, DN)
  // with the baseline proposal (and any linked enquiry revisions) so the Hub is never split or empty.
  // Also overlays live currentEnquiry fields on any active Draft quotation so there is zero stale flash after EnquiryForm edits.
  const unifiedHubDocuments = useMemo(() => {
    const resolvedSpName =
      resolveSalespersonName(currentEnquiry, salespersons) || user?.full_name || user?.username || '';
    const liveEnqItems =
      Array.isArray(currentEnquiry.line_items) && currentEnquiry.line_items.length > 0
        ? buildBaseLineItemsFromSource(null, currentEnquiry)
        : null;

    const activeSaved = quotations
      .filter((q) => !q.is_deleted)
      .map((q) => {
        const isDraftClientQuote =
          (q.document_type || 'quotation') === 'quotation' &&
          String(q.status || 'Draft').toLowerCase() === 'draft' &&
          (!q.enquiry_id || q.enquiry_id === currentEnquiry.id);
        if (!isDraftClientQuote) return q;

        const mergedItems = liveEnqItems
          ? liveEnqItems.map((li, idx) => {
              const existingQi =
                (li.id && q.line_items?.find((old) => old.id === li.id)) || q.line_items?.[idx];
              return {
                ...(existingQi || {}),
                ...li,
                id: existingQi?.id || li.id || `item_${idx + 1}`
              };
            })
          : q.line_items;

        const effectiveTaxMode = currentEnquiry.tax_mode || q.tax_mode || 'taxes_extra';
        const calc =
          Array.isArray(mergedItems) && mergedItems.length > 0
            ? QuotationRepository.calculateTotals(
                mergedItems,
                q.freight_amount || 0,
                effectiveTaxMode,
                q.tax_rate_percent ?? 5
              )
            : null;

        return {
          ...q,
          line_items: mergedItems,
          subject: currentEnquiry.subject || q.subject,
          prepared_by: resolvedSpName || q.prepared_by,
          price_basis: currentEnquiry.price_basis || q.price_basis,
          delivery_period: currentEnquiry.delivery_period || q.delivery_period,
          payment_terms: currentEnquiry.payment_terms || q.payment_terms,
          validity_days:
            Number(currentEnquiry.validity_days) > 0
              ? Number(currentEnquiry.validity_days)
              : q.validity_days,
          tax_mode: effectiveTaxMode,
          ...(calc
            ? {
                subtotal: calc.subtotal,
                tax_amount: calc.tax_amount,
                grand_total: calc.grand_total
              }
            : {})
        };
      });

    // Deduplicate commercial quotations that share the same revision_number on the same enquiry
    // (e.g., if a previous race created both R1 (Superseded) and R1 (Draft), keep the active/non-Superseded record)
    const dedupedActiveSaved: Quotation[] = [];
    const seenQuoteByRevKey = new Map<string, number>();
    activeSaved.forEach((doc) => {
      const isCommercialQuote = (doc.document_type || 'quotation') === 'quotation';
      if (!isCommercialQuote) {
        dedupedActiveSaved.push(doc);
        return;
      }
      const revKey = `${doc.enquiry_id || currentEnquiry.id || ''}__R${doc.revision_number || 1}`;
      const existingIdx = seenQuoteByRevKey.get(revKey);
      if (existingIdx === undefined) {
        seenQuoteByRevKey.set(revKey, dedupedActiveSaved.length);
        dedupedActiveSaved.push(doc);
      } else {
        const prev = dedupedActiveSaved[existingIdx];
        const prevIsSuperseded = prev.status === 'Superseded';
        const currIsSuperseded = doc.status === 'Superseded';
        const prevTime = new Date((prev as any).updatedAt || prev.created_at || 0).getTime();
        const currTime = new Date((doc as any).updatedAt || doc.created_at || 0).getTime();
        if ((prevIsSuperseded && !currIsSuperseded) || (prevIsSuperseded === currIsSuperseded && currTime >= prevTime)) {
          dedupedActiveSaved[existingIdx] = doc;
        }
      }
    });

    const savedQuoteDocs = dedupedActiveSaved.filter((q) => (q.document_type || 'quotation') === 'quotation');

    // Collect linked enquiry records (root + any legacy cloned revisions)
    const rootId = currentEnquiry.parent_id || currentEnquiry.id;
    const linkedEnquiries =
      enquiries && enquiries.length > 0 && rootId
        ? enquiries.filter((e) => !e.is_deleted && (e.id === rootId || e.parent_id === rootId))
        : [currentEnquiry];
    const chainList = linkedEnquiries.length > 0 ? linkedEnquiries : [currentEnquiry];

    const synthesizedQuotes: Quotation[] = [];
    chainList.forEach((enqItem, idx) => {
      const effectiveEnq = enqItem.id === currentEnquiry.id ? currentEnquiry : enqItem;
      const revNum = Math.max(1, Number(effectiveEnq.revision_number) || idx + 1);
      const rawRef = QuotationRepository.sanitizeCanonicalQuoteRef(effectiveEnq.quote_ref_no || '');
      const baseRef = rawRef.replace(/-R\d+$/i, '');
      const expectedFormattedRef = rawRef
        ? /-R\d+$/i.test(rawRef)
          ? rawRef
          : `${baseRef}-R${revNum}`
        : '';

      const alreadyInSaved = savedQuoteDocs.some(
        (sq) =>
          (expectedFormattedRef &&
            (sq.formatted_quote_ref === expectedFormattedRef || sq.formatted_quote_ref === rawRef)) ||
          (sq.enquiry_id === effectiveEnq.id && (sq.revision_number || 1) === revNum) ||
          (effectiveEnq.id === currentEnquiry.id && savedQuoteDocs.length > 0 && chainList.length === 1)
      );

      if (!alreadyInSaved) {
        synthesizedQuotes.push(buildSynthesizedQuotationFromEnquiry(effectiveEnq, revNum));
      }
    });

    const combined = [...dedupedActiveSaved, ...synthesizedQuotes];
    return combined.sort((a, b) => {
      if (a.status === 'Approved' && b.status !== 'Approved') return -1;
      if (b.status === 'Approved' && a.status !== 'Approved') return 1;
      const aIsQuote = (a.document_type || 'quotation') === 'quotation';
      const bIsQuote = (b.document_type || 'quotation') === 'quotation';
      if (aIsQuote && bIsQuote && (b.revision_number ?? 1) !== (a.revision_number ?? 1)) {
        return (b.revision_number ?? 1) - (a.revision_number ?? 1);
      }
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }, [
    quotations,
    currentEnquiry,
    enquiries,
    companies,
    contacts,
    salespersons,
    documentProfile,
    activeWorkspace,
    activeWorkspaceId,
    user
  ]);

  const resolvePrimarySavedQuotation = () => {
    return (
      unifiedHubDocuments.find(
        (q) =>
          (q.document_type || 'quotation') === 'quotation' &&
          !(q as any)._isBaselineEnquiryProposal &&
          q.status === 'Draft'
      ) ||
      unifiedHubDocuments.find(
        (q) =>
          (q.document_type || 'quotation') === 'quotation' &&
          !(q as any)._isBaselineEnquiryProposal &&
          q.status !== 'Superseded'
      ) ||
      unifiedHubDocuments.find(
        (q) =>
          (q.document_type || 'quotation') === 'quotation' &&
          !(q as any)._isBaselineEnquiryProposal
      ) ||
      null
    );
  };

  // Auto-open Quotation Studio when triggered via [⚡ Save & Open Studio] from EnquiryForm
  // Wait until QuotationRepository.getQuotationsForEnquiry has resolved for currentEnquiry.id so existing R1 is bound
  useEffect(() => {
    if (autoOpenStudio && (!currentEnquiry?.id || loadedQuotationsEnquiryId === currentEnquiry.id)) {
      const targetQuote = resolvePrimarySavedQuotation();
      setEditingQuotation(targetQuote);
      setIsQuotationStudioOpen(true);
      onAutoOpenStudioConsumed?.();
    }
  }, [autoOpenStudio, loadedQuotationsEnquiryId, currentEnquiry?.id, unifiedHubDocuments, onAutoOpenStudioConsumed]);

  // Derived sorted quotations: pin approved quotation at top, then sort descending by creation / revision
  const sortedQuotations = unifiedHubDocuments;

  const filteredHubDocuments = useMemo(() => {
    if (docHubFilter === 'all') return unifiedHubDocuments;
    return unifiedHubDocuments.filter((q) => (q.document_type || 'quotation') === docHubFilter);
  }, [unifiedHubDocuments, docHubFilter]);

  const hasApprovedQuotation = useMemo(() => {
    return unifiedHubDocuments.some(
      (q) => (q.document_type || 'quotation') === 'quotation' && q.status === 'Approved'
    );
  }, [unifiedHubDocuments]);

  // Helper to get the primary source Quotation for 1-click DO / PO / REC conversions
  const getPrimarySourceQuotation = (): Quotation | null => {
    const stdQuotes = unifiedHubDocuments.filter(
      (q) => (q.document_type || 'quotation') === 'quotation' && q.status !== 'Declined'
    );
    return (
      stdQuotes.find((q) => q.status === 'Approved') ||
      stdQuotes.find((q) => q.status === 'Sent') ||
      stdQuotes[0] ||
      null
    );
  };

  // 1-Click Conversion: Issue Delivery Note (DO) with automatic partial-delivery balance tracking
  const handleIssueDeliveryNote = (sourceQuoteOverride?: Quotation | null) => {
    const sourceQuote = sourceQuoteOverride ?? getPrimarySourceQuotation();
    const baseItems = buildBaseLineItemsFromSource(sourceQuote);
    const baseQuoteRef = QuotationRepository.sanitizeCanonicalQuoteRef(
      sourceQuote?.quote_number ||
        currentEnquiry.quote_ref_no ||
        `QT-${new Date().getFullYear()}-${String(currentEnquiry.sn || 1).padStart(4, '0')}`
    );
    const linkedDoRef = QuotationRepository.generateLinkedDocumentRef(
      baseQuoteRef,
      'delivery_note',
      quotations
    );
    const todayIso = new Date().toISOString().slice(0, 10);

    // Sum prior delivered quantities across existing Delivery Notes on this enquiry
    const priorDeliveryNotes = quotations.filter(
      (q) => !q.is_deleted && q.document_type === 'delivery_note'
    );
    const doLineItems: QuotationLineItem[] = baseItems.map((item, idx) => {
      const orderedQty = Number(item.qty_ordered ?? item.quantity) || 0;
      const alreadyDelivered = priorDeliveryNotes.reduce((sum, doDoc) => {
        const matchedLine = (doDoc.line_items || []).find(
          (li, lIdx) =>
            (item.id && li.id === item.id) ||
            (item.item_name && li.item_name === item.item_name && lIdx === idx)
        );
        if (!matchedLine) return sum;
        return sum + (Number(matchedLine.qty_delivered ?? matchedLine.quantity) || 0);
      }, 0);
      const remainingToDeliver = Math.max(0, orderedQty - alreadyDelivered);
      const deliverNow = remainingToDeliver > 0 ? remainingToDeliver : orderedQty;
      const nextSubComponents = Array.isArray(item.sub_components)
        ? item.sub_components.map((sub) => {
            const subOrd = Number(sub.qty_ordered ?? sub.quantity) || 0;
            return {
              ...sub,
              qty_ordered: subOrd,
              qty_delivered: subOrd,
              qty_balance: 0
            };
          })
        : undefined;
      return {
        ...item,
        qty_ordered: orderedQty,
        qty_delivered: deliverNow,
        qty_balance: Math.max(0, orderedQty - alreadyDelivered - deliverNow),
        ...(nextSubComponents ? { sub_components: nextSubComponents } : {})
      };
    });

    const wsId = currentEnquiry.workspace_id || activeWorkspaceId || 'ws_default';
    const draftDo: Quotation = {
      ...(sourceQuote || {}),
      id: `do_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      workspace_id: wsId,
      workspaceId: wsId,
      enquiry_id: currentEnquiry.id,
      document_type: 'delivery_note',
      quote_number: baseQuoteRef.replace(/-R\d+$/i, ''),
      revision_number: 1,
      formatted_quote_ref: linkedDoRef,
      status: 'Draft',
      subject: sourceQuote?.subject || currentEnquiry.subject || '',
      client_snapshot: sourceQuote?.client_snapshot || {
        entity_name: currentEnquiry.company_name || currentEnquiry.client_company || 'Client',
        contact_person: currentEnquiry.concerned_person || undefined,
        address: currentEnquiry.project_location || currentEnquiry.country || undefined
      },
      sender_snapshot: sourceQuote?.sender_snapshot || {
        entity_name:
          documentProfile?.legal_entity_name ||
          activeWorkspace?.name ||
          'Commercial Entity'
      },
      delivery_metadata: {
        delivery_ref: linkedDoRef,
        delivery_date: todayIso,
        related_quote_ref: sourceQuote?.formatted_quote_ref || baseQuoteRef,
        site_contact_name:
          sourceQuote?.client_contact_person || currentEnquiry.concerned_person || '',
        site_contact_phone: (currentEnquiry as any)?.contact_phone || '',
        delivery_address:
          sourceQuote?.client_address ||
          currentEnquiry.project_location ||
          currentEnquiry.country ||
          '',
        dispatch_mode: 'Company Transport',
        dispatched_by_name:
          sourceQuote?.prepared_by ||
          user?.full_name ||
          user?.name ||
          user?.username ||
          '',
        goods_received_clause: 'Received the above items in good order and condition.'
      },
      line_items: doLineItems,
      tax_mode: sourceQuote?.tax_mode || 'taxes_extra',
      visible_columns: {
        ...(sourceQuote?.visible_columns || documentProfile?.visible_columns || {}),
        unit_price: false,
        showUnitPrice: false,
        showLineTotal: false
      } as any,
      subtotal: 0,
      freight_amount: 0,
      tax_rate_percent: 0,
      tax_amount: 0,
      grand_total: 0,
      price_basis: sourceQuote?.price_basis || 'Delivered Site',
      payment_terms: sourceQuote?.payment_terms || 'As Agreed',
      signatories: sourceQuote?.signatories || [],
      created_at: new Date().toISOString(),
      valid_until: new Date().toISOString(),
      currency: sourceQuote?.currency || currentEnquiry.currency || 'AED'
    };

    setEditingQuotation(draftDo);
    setIsQuotationStudioOpen(true);
  };

  // 1-Click Conversion: Open Supplier PO Builder Modal
  const handleOpenSupplierPoModal = (sourceQuoteOverride?: Quotation | null) => {
    const sourceQuote = sourceQuoteOverride ?? getPrimarySourceQuotation();
    const baseItems = buildBaseLineItemsFromSource(sourceQuote);
    setPoModalState({
      isOpen: true,
      sourceQuote,
      poVariant: 'supplier_po',
      supplierCompanyId: '',
      supplierName: '',
      supplierContact: '',
      supplierEmail: '',
      supplierPhone: '',
      supplierAddress: '',
      supplierTrn: '',
      shippingDestination: 'Warehouse',
      incoterms: 'Ex-Works',
      selectedItemIndices: baseItems.map((_, idx) => idx)
    });
  };

  // Confirm Supplier PO Modal & Persist Immediately (with optional Open in Studio)
  const handleConfirmLaunchSupplierPo = async (openInStudio: boolean = true) => {
    const sourceQuote = poModalState.sourceQuote ?? getPrimarySourceQuotation();
    const allItems = buildBaseLineItemsFromSource(sourceQuote);
    const chosenIndices =
      poModalState.selectedItemIndices.length > 0
        ? poModalState.selectedItemIndices
        : allItems.map((_, idx) => idx);
    const isOutboundSupplierPo = poModalState.poVariant === 'supplier_po';

    const poLineItems: QuotationLineItem[] = allItems
      .filter((_, idx) => chosenIndices.includes(idx))
      .map((item) => {
        const matchedProd = products.find(
          (p) =>
            (item.product_id && p.id === item.product_id) ||
            (item.sku && p.sku && p.sku.toLowerCase() === item.sku.toLowerCase()) ||
            (item.item_name &&
              (p.name || p.description || '').trim().toLowerCase() ===
                item.item_name.trim().toLowerCase())
        );
        const qty = Number(item.quantity) || 1;
        // For Outbound Supplier POs, strictly use cost_price (or catalog cost_price, fallback 0.00) — never expose client selling price
        const unitRate = isOutboundSupplierPo
          ? item.cost_price !== undefined && item.cost_price !== null && Number(item.cost_price) > 0
            ? Number(item.cost_price)
            : matchedProd?.cost_price !== undefined && matchedProd?.cost_price !== null
            ? Number(matchedProd.cost_price)
            : 0
          : Number(item.unit_price) || 0;
        return {
          ...item,
          quantity: qty,
          qty: qty,
          qty_ordered: qty,
          qty_received: 0,
          qty_pending: qty,
          unit_price: unitRate,
          cost_price: unitRate,
          total_price: QuotationRepository.roundCurrency(qty * unitRate)
        };
      });

    const selectedVendor = companies.find((c) => c.id === poModalState.supplierCompanyId);
    const baseQuoteRef = QuotationRepository.sanitizeCanonicalQuoteRef(
      sourceQuote?.quote_number ||
        currentEnquiry.quote_ref_no ||
        `QT-${new Date().getFullYear()}-${String(currentEnquiry.sn || 1).padStart(4, '0')}`
    );
    const linkedPoRef = QuotationRepository.generateLinkedDocumentRef(
      baseQuoteRef,
      'purchase_order',
      quotations
    );
    const todayIso = new Date().toISOString().slice(0, 10);
    const wsId = currentEnquiry.workspace_id || activeWorkspaceId || 'ws_default';
    const totals = QuotationRepository.calculateTotals(
      poLineItems,
      0,
      sourceQuote?.tax_mode || 'taxes_extra',
      sourceQuote?.tax_rate_percent ?? 5
    );

    const draftPo: Quotation = {
      ...(sourceQuote || {}),
      id: `po_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      workspace_id: wsId,
      workspaceId: wsId,
      enquiry_id: currentEnquiry.id,
      project_id: currentEnquiry.project_id,
      project_number: currentEnquiry.project_number,
      document_type: 'purchase_order',
      quote_number: baseQuoteRef.replace(/-R\d+$/i, ''),
      revision_number: 1,
      formatted_quote_ref: linkedPoRef,
      status: 'Approved',
      subject:
        sourceQuote?.subject ||
        currentEnquiry.subject ||
        `Purchase Order against Ref ${baseQuoteRef}`,
      client_snapshot: sourceQuote?.client_snapshot || {
        entity_name: currentEnquiry.company_name || currentEnquiry.client_company || 'Client',
        contact_person: currentEnquiry.concerned_person || undefined,
        address: currentEnquiry.project_location || currentEnquiry.country || undefined
      },
      sender_snapshot: sourceQuote?.sender_snapshot || {
        entity_name:
          documentProfile?.legal_entity_name ||
          activeWorkspace?.name ||
          'Commercial Entity'
      },
      purchase_order_metadata: {
        po_variant: poModalState.poVariant,
        po_ref: linkedPoRef,
        po_date: todayIso,
        supplier_id: poModalState.supplierCompanyId || undefined,
        vendor_company_id: poModalState.supplierCompanyId || undefined,
        supplier_name:
          poModalState.supplierName ||
          (poModalState.poVariant === 'order_acknowledgment'
            ? currentEnquiry.company_name || currentEnquiry.client_company || ''
            : 'Supplier'),
        supplier_contact: poModalState.supplierContact || '',
        supplier_email: poModalState.supplierEmail || '',
        supplier_phone: poModalState.supplierPhone || '',
        supplier_address: poModalState.supplierAddress || '',
        supplier_tax_id: poModalState.supplierTrn || '',
        supplier_trn: poModalState.supplierTrn || '',
        shipping_destination: poModalState.shippingDestination,
        incoterms: poModalState.incoterms,
        receiving_status: 'Pending Receipt',
        beneficiary_bank_details: selectedVendor?.vendor_bank_details
          ? { ...selectedVendor.vendor_bank_details }
          : undefined,
        project_id: currentEnquiry.project_id,
        project_number: currentEnquiry.project_number,
        requisitioner_name:
          sourceQuote?.prepared_by || user?.full_name || user?.name || user?.username || ''
      },
      line_items: poLineItems,
      tax_mode: sourceQuote?.tax_mode || 'taxes_extra',
      visible_columns: {
        ...(sourceQuote?.visible_columns || documentProfile?.visible_columns || {}),
        unit_price: true,
        showUnitPrice: true,
        showLineTotal: true
      } as any,
      subtotal: totals.subtotal,
      freight_amount: totals.freight_amount,
      tax_rate_percent: totals.tax_rate_percent,
      tax_amount: totals.tax_amount,
      grand_total: totals.grand_total,
      price_basis: poModalState.incoterms,
      payment_terms:
        selectedVendor?.default_payment_terms || sourceQuote?.payment_terms || '30 Days Net',
      signatories: sourceQuote?.signatories || [],
      created_at: new Date().toISOString(),
      valid_until: new Date().toISOString(),
      currency:
        selectedVendor?.default_currency || sourceQuote?.currency || currentEnquiry.currency || 'AED'
    };

    try {
      const savedPo = await QuotationRepository.saveQuotation(draftPo);
      setQuotations((prev) => [savedPo, ...prev.filter((q) => q.id !== savedPo.id)]);
      setPoModalState((prev) => ({ ...prev, isOpen: false }));
      if (openInStudio) {
        setEditingQuotation(savedPo);
        setIsQuotationStudioOpen(true);
      } else {
        triggerToast?.(
          `Supplier PO ${savedPo.formatted_quote_ref} saved and ready in Pending Stock Receipts.`,
          'success'
        );
      }
    } catch (err) {
      console.warn('[EnquiryDetail] Failed saving PO before Studio launch, falling back to draft:', err);
      setPoModalState((prev) => ({ ...prev, isOpen: false }));
      setEditingQuotation(draftPo);
      setIsQuotationStudioOpen(true);
    }
  };

  // 1-Click Conversion: Issue Payment Receipt (REC) with cumulative balance tracking
  const handleIssuePaymentReceipt = (sourceQuoteOverride?: Quotation | null) => {
    const sourceQuote = sourceQuoteOverride ?? getPrimarySourceQuotation();
    const baseItems = buildBaseLineItemsFromSource(sourceQuote);
    const baseQuoteRef = QuotationRepository.sanitizeCanonicalQuoteRef(
      sourceQuote?.quote_number ||
        currentEnquiry.quote_ref_no ||
        `QT-${new Date().getFullYear()}-${String(currentEnquiry.sn || 1).padStart(4, '0')}`
    );
    const linkedRecRef = QuotationRepository.generateLinkedDocumentRef(
      baseQuoteRef,
      'receipt',
      quotations
    );
    const todayIso = new Date().toISOString().slice(0, 10);

    // Sum prior receipts on this enquiry to auto-populate previously_received
    const previouslyReceived = quotations
      .filter((q) => !q.is_deleted && q.document_type === 'receipt')
      .reduce(
        (sum, r) => sum + (Number(r.receipt_metadata?.amount_received ?? r.grand_total) || 0),
        0
      );
    const contractTotal =
      Number(sourceQuote?.grand_total) || Number(currentEnquiry.value_aed) || 0;
    const defaultAmountNow = Math.max(0, contractTotal - previouslyReceived);

    const wsId = currentEnquiry.workspace_id || activeWorkspaceId || 'ws_default';
    const draftRec: Quotation = {
      ...(sourceQuote || {}),
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      workspace_id: wsId,
      workspaceId: wsId,
      enquiry_id: currentEnquiry.id,
      document_type: 'receipt',
      quote_number: baseQuoteRef.replace(/-R\d+$/i, ''),
      revision_number: 1,
      formatted_quote_ref: linkedRecRef,
      status: 'Draft',
      subject:
        sourceQuote?.subject ||
        currentEnquiry.subject ||
        `Payment Receipt against ${sourceQuote?.formatted_quote_ref || baseQuoteRef}`,
      client_snapshot: sourceQuote?.client_snapshot || {
        entity_name: currentEnquiry.company_name || currentEnquiry.client_company || 'Client',
        contact_person: currentEnquiry.concerned_person || undefined,
        address: currentEnquiry.project_location || currentEnquiry.country || undefined
      },
      sender_snapshot: sourceQuote?.sender_snapshot || {
        entity_name:
          documentProfile?.legal_entity_name ||
          activeWorkspace?.name ||
          'Commercial Entity'
      },
      receipt_metadata: {
        receipt_ref: linkedRecRef,
        receipt_date: todayIso,
        received_from:
          sourceQuote?.client_snapshot?.entity_name ||
          currentEnquiry.company_name ||
          currentEnquiry.client_company ||
          '',
        settlement_for_ref: sourceQuote?.formatted_quote_ref || baseQuoteRef,
        project_title:
          sourceQuote?.subject ||
          currentEnquiry.subject ||
          `Settlement against Quotation ${sourceQuote?.formatted_quote_ref || baseQuoteRef}`,
        payment_for:
          sourceQuote?.subject ||
          currentEnquiry.subject ||
          `Settlement against Quotation ${sourceQuote?.formatted_quote_ref || baseQuoteRef}`,
        payment_method: 'Bank Wire Transfer',
        total_order_value: contractTotal,
        previously_received: previouslyReceived,
        amount_received: defaultAmountNow,
        balance_outstanding: Math.max(0, contractTotal - previouslyReceived - defaultAmountNow),
        balance_remaining: Math.max(0, contractTotal - previouslyReceived - defaultAmountNow),
        show_line_items_table: false
      },
      line_items: baseItems,
      tax_mode: sourceQuote?.tax_mode || 'taxes_extra',
      subtotal: defaultAmountNow,
      freight_amount: 0,
      tax_rate_percent: 0,
      tax_amount: 0,
      grand_total: defaultAmountNow,
      price_basis: sourceQuote?.price_basis || 'As Agreed',
      payment_terms: sourceQuote?.payment_terms || 'Received with Thanks',
      signatories: sourceQuote?.signatories || [],
      created_at: new Date().toISOString(),
      valid_until: new Date().toISOString(),
      currency: sourceQuote?.currency || currentEnquiry.currency || 'AED'
    };

    setEditingQuotation(draftRec);
    setIsQuotationStudioOpen(true);
  };

  // Check if a project document is already attached to this enquiry
  useEffect(() => {
    if (currentEnquiry?.id) {
      getProjectForEnquiry(currentEnquiry.id).then((p) => {
        if (p) setLinkedProject(p);
      });
    }
  }, [currentEnquiry?.id, currentEnquiry?.project_id]);

  // Status transition handler: auto-reserves stock on Won, auto-releases on Lost/Cancelled
  const handleStatusTransition = async (newStatus: string) => {
    if (!currentEnquiry?.id || isUpdatingStatus || newStatus === currentEnquiry.status) return;
    setIsUpdatingStatus(true);
    const oldStatus = currentEnquiry.status;
    const nowIso = new Date().toISOString();

    try {
      let isStockReserved = Boolean(currentEnquiry.stock_reserved);
      let stockReservedAt = currentEnquiry.stock_reserved_at;

      // 1. Transition TO Won/Order Received/Approved
      if (isWonStatus(newStatus) && !isWonStatus(oldStatus)) {
        const res = await reserveEnquiryStock(currentEnquiry, user);
        isStockReserved = true;
        stockReservedAt = nowIso;
        if (onStockUpdated) {
          onStockUpdated();
        }
        if (triggerToast) {
          triggerToast(
            res.reservedCount > 0
              ? `Status updated to "${newStatus}". Auto-reserved stock for ${res.reservedCount} line item(s).`
              : `Status updated to "${newStatus}".`,
            'success'
          );
        }
      }
      // 2. Transition into Lost or Cancelled
      else if (isLostOrCancelledStatus(newStatus)) {
        let linkedProjectCancelled = false;
        const linkedProjId = currentEnquiry.project_id || linkedProject?.id;
        if (linkedProjId) {
          try {
            await safeUpdateDoc('projects', linkedProjId, {
              status: 'Cancelled',
              cancellation_reason: `Cancelled via Proposal #${currentEnquiry.sn || ''} transition to ${newStatus}`,
              updated_at: nowIso
            });
            linkedProjectCancelled = true;
            if (linkedProject) {
              setLinkedProject((prev) =>
                prev
                  ? {
                      ...prev,
                      status: 'Cancelled',
                      cancellation_reason: `Cancelled via Proposal #${currentEnquiry.sn || ''} transition to ${newStatus}`,
                      updated_at: nowIso
                    }
                  : null
              );
            }
          } catch (projErr) {
            console.error('Failed to cancel linked project:', projErr);
          }
        }

        if (isStockReserved || linkedProjectCancelled) {
          const rel = await releaseEnquiryStock(currentEnquiry, user);
          isStockReserved = false;
          stockReservedAt = null;
          if (onStockUpdated) {
            onStockUpdated();
          }
          if (triggerToast) {
            if (linkedProjectCancelled) {
              triggerToast('Linked project and reserved inventory have been cancelled and released.', 'info');
            } else if (rel.releasedCount > 0) {
              triggerToast(
                `Status updated to "${newStatus}". Released reserved stock for ${rel.releasedCount} line item(s).`,
                'info'
              );
            } else {
              triggerToast(`Status updated to "${newStatus}".`, 'info');
            }
          }
        } else if (triggerToast) {
          if (linkedProjectCancelled) {
            triggerToast('Linked project has been cancelled.', 'info');
          } else {
            triggerToast(`Status updated to "${newStatus}".`, 'info');
          }
        }
      } else {
        if (triggerToast) {
          triggerToast(`Status updated to "${newStatus}".`, 'info');
        }
      }

      const updatedEnquiry: Enquiry = {
        ...currentEnquiry,
        status: newStatus as any,
        stock_reserved: isStockReserved,
        stock_reserved_at: stockReservedAt,
        updatedAt: nowIso
      };

      await safeUpdateDoc('enquiries', currentEnquiry.id, {
        status: newStatus,
        stock_reserved: isStockReserved,
        stock_reserved_at: stockReservedAt,
        updatedAt: nowIso
      });

      setCurrentEnquiry(updatedEnquiry);
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === currentEnquiry.id ? updatedEnquiry : e)));
      }
      if (onUpdateEnquiry) {
        onUpdateEnquiry(updatedEnquiry);
      }
    } catch (err: any) {
      console.error('Failed to update status:', err);
      if (triggerToast) {
        triggerToast('Failed to update status: ' + err.message, 'error');
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Operational Handoff / Project Conversion Modal State
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertProjectType, setConvertProjectType] = useState<'Supply Only' | 'Turnkey / Installation'>('Supply Only');
  const [convertSelectedOption, setConvertSelectedOption] = useState<string>(
    currentEnquiry.proposal_option || 'Option A'
  );
  const [modalMilestones, setModalMilestones] = useState<ProjectMilestone[]>([]);
  const [convertEngineerName, setConvertEngineerName] = useState(
    user?.full_name || (user as any)?.name || (user as any)?.displayName || ''
  );
  const [convertTargetDate, setConvertTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [convertSiteLocation, setConvertSiteLocation] = useState(
    currentEnquiry.project_location || (currentEnquiry as any).location || currentEnquiry.company_name || ''
  );
  const [convertOperationalNotes, setConvertOperationalNotes] = useState(currentEnquiry.remarks || '');

  const handleOpenConvertModal = () => {
    const isTurnkey = (currentEnquiry.line_items || []).some(
      (it) =>
        (it.description || '').toLowerCase().includes('installation') ||
        (it.product_type || '').toLowerCase().includes('fabrication')
    );
    const initialType: 'Supply Only' | 'Turnkey / Installation' = isTurnkey ? 'Turnkey / Installation' : 'Supply Only';
    setConvertProjectType(initialType);
    setModalMilestones(getDefaultMilestones(initialType));
    const distinctOptions = Array.from(
      new Set(
        (currentEnquiry.line_items || [])
          .map((it) => ((it as any).option_designation || it.option || '').trim())
          .filter((o) => o && o !== 'Default / Included' && o !== 'Baseline / All')
      )
    );
    setConvertSelectedOption(
      currentEnquiry.proposal_option || distinctOptions[0] || 'Option A'
    );
    setConvertEngineerName(user?.full_name || (user as any)?.name || (user as any)?.displayName || '');
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setConvertTargetDate(d.toISOString().split('T')[0]);
    setConvertSiteLocation(
      currentEnquiry.project_location || (currentEnquiry as any).location || currentEnquiry.company_name || ''
    );
    setConvertOperationalNotes(currentEnquiry.remarks || '');
    setShowConvertModal(true);
  };

  const handleSelectProjectType = (type: 'Supply Only' | 'Turnkey / Installation') => {
    setConvertProjectType(type);
    setModalMilestones(getDefaultMilestones(type));
  };

  const handleUpdateMilestoneTitle = (id: string, newTitle: string) => {
    setModalMilestones((prev) =>
      prev.map((ms) => (ms.id === id ? { ...ms, title: newTitle } : ms))
    );
  };

  const handleRemoveMilestone = (id: string) => {
    setModalMilestones((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((ms) => ms.id !== id);
    });
  };

  const handleAddMilestone = () => {
    setModalMilestones((prev) => [
      ...prev,
      { id: 'ms_' + Date.now(), title: 'New Operational Phase', status: 'Pending' }
    ]);
  };

  const handleConfirmCreateProject = async () => {
    if (!currentEnquiry?.id || isCreatingProject) return;
    setIsCreatingProject(true);
    try {
      const effectiveWinningOption = optionAnalysis.hasMultipleOptions ? convertSelectedOption : undefined;
      const conversionOptions: ProjectConversionOptions = {
        project_type: convertProjectType,
        assigned_engineer_name: convertEngineerName.trim() || undefined,
        target_delivery_date: convertTargetDate || undefined,
        site_location: convertSiteLocation.trim() || undefined,
        operational_notes: convertOperationalNotes.trim() || undefined,
        milestones: modalMilestones,
        selected_option: effectiveWinningOption
      };

      // Ensure stock is reserved on project launch if not already reserved
      let isStockReserved = Boolean(currentEnquiry.stock_reserved);
      const hasInventoriedItems = Boolean(
        currentEnquiry.line_items &&
          currentEnquiry.line_items.some(
            (it) =>
              it.product_id ||
              (it.is_composite_set &&
                Array.isArray(it.sub_components) &&
                it.sub_components.some((sc) => sc.product_id))
          )
      );

      const enquiryWithOption: Enquiry = {
        ...currentEnquiry,
        ...(effectiveWinningOption ? { proposal_option: effectiveWinningOption } : {})
      };

      if (!isStockReserved && hasInventoriedItems) {
        try {
          const res = await reserveEnquiryStock(enquiryWithOption, user);
          if (res.reservedCount > 0) {
            isStockReserved = true;
          }
        } catch (resErr) {
          console.warn('Failed auto-reserving stock on project launch:', resErr);
        }
      }

      const newProject = await createProjectFromEnquiry(
        { ...enquiryWithOption, stock_reserved: isStockReserved },
        user,
        conversionOptions
      );
      setLinkedProject(newProject);

      const updatedEnquiry: Enquiry = {
        ...enquiryWithOption,
        project_id: newProject.id,
        project_number: newProject.project_number,
        stock_reserved: isStockReserved,
        stock_reserved_at: isStockReserved ? (currentEnquiry.stock_reserved_at || new Date().toISOString()) : undefined,
        updatedAt: new Date().toISOString()
      };

      setCurrentEnquiry(updatedEnquiry);
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === currentEnquiry.id ? updatedEnquiry : e)));
      }
      if (onUpdateEnquiry) {
        onUpdateEnquiry(updatedEnquiry);
      }

      setShowConvertModal(false);

      if (onStockUpdated) {
        onStockUpdated();
      }

      if (triggerToast) {
        triggerToast(`Project ${newProject.project_number} created successfully!`, 'success');
      }
    } catch (err: any) {
      console.error('Failed to create project:', err);
      if (triggerToast) {
        triggerToast('Failed to create project: ' + err.message, 'error');
      }
    } finally {
      setIsCreatingProject(false);
    }
  };

  const currentWsId = activeWorkspaceId || activeWorkspace?.id || currentEnquiry.workspace_id;

  // Evaluate RBAC permissions to manage collaborators and sharing
  const canManageSharing = React.useMemo(() => {
    return canManageEnquirySharing(user, currentEnquiry, currentWsId, activeWorkspace);
  }, [user, currentEnquiry, currentWsId, activeWorkspace]);

  // Helper to determine if a salesperson is currently an active collaborator
  const isMemberCollaborator = React.useCallback((sp: Salesperson, targetEnquiry: Enquiry = currentEnquiry): boolean => {
    const spId = (sp.id || '').toLowerCase();
    const spLinkedUid = (sp.linked_user_id || '').toLowerCase();
    const spFullName = (sp.full_name || '').toLowerCase().trim();
    const spInitials = (sp.initials || '').toUpperCase().trim();
    const spEmail = (sp.email || '').toLowerCase().trim();

    // 1. Check shared_with_uids
    if (Array.isArray(targetEnquiry.shared_with_uids)) {
      const uids = targetEnquiry.shared_with_uids.map((u) => String(u).toLowerCase().trim());
      if (spLinkedUid && uids.includes(spLinkedUid)) return true;
      if (spId && uids.includes(spId)) return true;
    }

    // 2. Check shared_with_names
    if (Array.isArray(targetEnquiry.shared_with_names)) {
      const names = targetEnquiry.shared_with_names.map((n) => String(n).toLowerCase().trim());
      if (spFullName && names.includes(spFullName)) return true;
    }

    // 3. Check additional_team
    const rawTeam = targetEnquiry.additional_team;
    if (Array.isArray(rawTeam)) {
      for (const item of rawTeam) {
        if (!item) continue;
        if (typeof item === 'string') {
          const itemTrimmed = item.trim();
          const itemLower = itemTrimmed.toLowerCase();
          const itemUpper = itemTrimmed.toUpperCase();
          if (spFullName && (itemLower === spFullName || itemLower.includes(spFullName))) return true;
          if (spInitials && itemUpper === spInitials) return true;
          if (spEmail && itemLower === spEmail) return true;
          if (spId && itemLower === spId) return true;
          if (spLinkedUid && itemLower === spLinkedUid) return true;
        } else if (typeof item === 'object') {
          const oName = String((item as any).name || (item as any).full_name || '').toLowerCase();
          const oUid = String((item as any).uid || (item as any).id || '').toLowerCase();
          const oInit = String((item as any).initials || '').toUpperCase();
          if (spFullName && oName === spFullName) return true;
          if (spLinkedUid && oUid === spLinkedUid) return true;
          if (spId && oUid === spId) return true;
          if (spInitials && oInit === spInitials) return true;
        }
      }
    } else if (typeof rawTeam === 'string' && rawTeam.trim()) {
      const parts = rawTeam.split(/[,;|]/).map((s) => s.trim());
      for (const p of parts) {
        if (!p) continue;
        if (spFullName && p.toLowerCase() === spFullName) return true;
        if (spInitials && p.toUpperCase() === spInitials) return true;
      }
    }

    return false;
  }, [currentEnquiry]);

  // Extract all active collaborator salesperson profiles (excluding primary salesperson)
  const activeCollaboratorMembers = React.useMemo(() => {
    const spVal = (currentEnquiry.salesperson || currentEnquiry.sales_person || '').trim().toLowerCase();
    const spId = (currentEnquiry.salesperson_id || currentEnquiry.sales_person_id || '').toLowerCase();

    return salespersons.filter((sp) => {
      // Exclude primary salesperson
      if (spId && (sp.id?.toLowerCase() === spId || sp.linked_user_id?.toLowerCase() === spId)) return false;
      if (spVal && (sp.full_name?.toLowerCase() === spVal || sp.initials?.toLowerCase() === spVal)) return false;
      return isMemberCollaborator(sp, currentEnquiry);
    });
  }, [currentEnquiry, salespersons, isMemberCollaborator]);

  // Extract any legacy or unlinked names from additional_team
  const extraCollaboratorNames = React.useMemo(() => {
    const matchedNames = new Set(activeCollaboratorMembers.map((m) => m.full_name.toLowerCase()));
    const matchedInitials = new Set(activeCollaboratorMembers.map((m) => (m.initials || '').toUpperCase()));
    const extras: string[] = [];

    const rawTeam = currentEnquiry.additional_team;
    const items: string[] = Array.isArray(rawTeam)
      ? rawTeam.map((i) => (typeof i === 'string' ? i : (i as any).name || (i as any).full_name || '')).filter(Boolean)
      : typeof rawTeam === 'string'
      ? rawTeam.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
      : [];

    for (const it of items) {
      if (!it) continue;
      if (!matchedNames.has(it.toLowerCase()) && !matchedInitials.has(it.toUpperCase())) {
        extras.push(it);
      }
    }
    return extras;
  }, [currentEnquiry.additional_team, activeCollaboratorMembers]);

  const totalCollaboratorsCount = activeCollaboratorMembers.length + extraCollaboratorNames.length;

  // Atomic toggle handler for adding/removing collaborators
  const handleToggleCollaborator = async (sp: Salesperson, isCurrentlyCollaborator: boolean) => {
    const enquiryId = currentEnquiry.id || (currentEnquiry as any)._id;
    if (!enquiryId) {
      if (triggerToast) triggerToast('Error: Enquiry ID is missing.', 'error');
      return;
    }

    let updatedMembers: Salesperson[];
    if (isCurrentlyCollaborator) {
      updatedMembers = activeCollaboratorMembers.filter(
        (m) => m.id !== sp.id && m.initials !== sp.initials && m.full_name !== sp.full_name
      );
    } else {
      updatedMembers = [...activeCollaboratorMembers, sp];
    }

    const nextTeam = Array.from(
      new Set([
        ...updatedMembers.flatMap((m) => [m.initials, m.full_name].filter(Boolean) as string[]),
        ...extraCollaboratorNames
      ])
    );
    const nextUids = Array.from(
      new Set(
        updatedMembers
          .flatMap((m) => [(m as any).uid, (m as any).userId, m.linked_user_id, m.id])
          .filter(Boolean) as string[]
      )
    );
    const nextNames = Array.from(
      new Set([
        ...updatedMembers.map((m) => m.full_name).filter(Boolean),
        ...extraCollaboratorNames
      ])
    );

    const updatedPayload: Enquiry = {
      ...currentEnquiry,
      additional_team: nextTeam,
      shared_with: nextUids,
      shared_with_uids: nextUids,
      shared_with_names: nextNames,
      updatedAt: new Date().toISOString()
    };

    // 1. Instant local state updates
    setCurrentEnquiry(updatedPayload);
    if (setEnquiries) {
      setEnquiries((prev) => prev.map((e) => (e.id === enquiryId ? updatedPayload : e)));
    }
    if (onUpdateEnquiry) {
      onUpdateEnquiry(updatedPayload);
    }

    // 2. Atomic persistence to local storage and Firestore
    const wsId = currentEnquiry.workspace_id || activeWorkspaceId || 'ws_default';
    try {
      await EnquiryRepository.updateCollaborators(enquiryId, nextTeam, nextUids, nextNames, wsId);
      if (triggerToast) {
        if (isCurrentlyCollaborator) {
          triggerToast(`Access revoked for ${sp.full_name}`, 'info');
        } else {
          triggerToast(`Access granted to ${sp.full_name}`, 'success');
        }
      }
    } catch (err) {
      console.error('[EnquiryDetail] Failed to update collaborators:', err);
      if (triggerToast) {
        triggerToast('Failed to sync collaborator changes with server', 'error');
      }
    }
  };

  // Direct dismiss removal handler
  const handleRemoveCollaborator = async (spOrName: Salesperson | string) => {
    if (!canManageSharing) return;
    if (typeof spOrName === 'string') {
      const enquiryId = currentEnquiry.id || (currentEnquiry as any)._id;
      if (!enquiryId) return;

      const nextExtras = extraCollaboratorNames.filter((n) => n !== spOrName);
      const nextTeam = Array.from(
        new Set([
          ...activeCollaboratorMembers.flatMap((m) => [m.initials, m.full_name].filter(Boolean) as string[]),
          ...nextExtras
        ])
      );
      const nextUids = Array.from(
        new Set(
          activeCollaboratorMembers
            .flatMap((m) => [(m as any).uid, (m as any).userId, m.linked_user_id, m.id])
            .filter(Boolean) as string[]
        )
      );
      const nextNames = Array.from(
        new Set([
          ...activeCollaboratorMembers.map((m) => m.full_name).filter(Boolean),
          ...nextExtras
        ])
      );

      const updatedPayload: Enquiry = {
        ...currentEnquiry,
        additional_team: nextTeam,
        shared_with_uids: nextUids,
        shared_with_names: nextNames,
        updatedAt: new Date().toISOString()
      };

      setCurrentEnquiry(updatedPayload);
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === enquiryId ? updatedPayload : e)));
      }
      if (onUpdateEnquiry) {
        onUpdateEnquiry(updatedPayload);
      }

      const wsId = currentEnquiry.workspace_id || activeWorkspaceId || 'ws_default';
      try {
        await EnquiryRepository.updateCollaborators(enquiryId, nextTeam, nextUids, nextNames, wsId);
        if (triggerToast) {
          triggerToast(`Removed ${spOrName} from collaborators`, 'info');
        }
      } catch (err) {
        console.error('[EnquiryDetail] Failed to remove collaborator:', err);
        if (triggerToast) triggerToast('Failed to update collaborators', 'error');
      }
    } else {
      await handleToggleCollaborator(spOrName, true);
    }
  };

  const handleDownloadAttachment = async (file: Attachment | { name: string; url?: string; size?: number; type?: string }) => {
    const f = file as any;
    let downloadUrl = f.url || f.fileUrl || f.downloadURL || f.downloadUrl || f.file_url || f.dataUrl || f.src;
    if (!downloadUrl) {
      downloadUrl = await resolveAttachmentUrl(file as any);
    }
    if (downloadUrl) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = file.name || 'attachment';
      link.target = '_blank';
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 100);
      if (triggerToast) {
        triggerToast(`Downloading ${file.name}...`, 'info');
      }
    } else {
      if (triggerToast) {
        triggerToast(
          "This document is stored locally on the uploader's device and is not available on this browser. A workspace admin can configure Cloud Storage in Workspace Settings.",
          'error'
        );
      }
    }
  };

  const handleDeleteAttachment = async (targetIndex: number) => {
    const attachments = enquiry.attachments || [];
    const target = attachments[targetIndex];
    if (!target) return;

    if (!window.confirm(`Are you sure you want to remove the attachment "${target.name}"?`)) {
      return;
    }

    const key = target.storageKey || target.id || `att_${targetIndex}`;
    setDeletingAttachmentKey(key);

    try {
      const f = target as any;
      const fileUrl = f.url || f.fileUrl || f.downloadURL || f.downloadUrl || '';

      // Unified 1GB Bucket & IndexedDB Deletion
      await deleteFromStorageBucket(fileUrl, activeWorkspace, target.storageKey);

      const updatedAttachments = attachments.filter((_, i) => i !== targetIndex);
      const updatedEnquiry: Enquiry = {
        ...enquiry,
        attachments: updatedAttachments.length > 0 ? updatedAttachments : undefined
      };

      if (enquiry.id) {
        await safeUpdateDoc('enquiries', enquiry.id, {
          attachments: updatedAttachments.length > 0 ? updatedAttachments : []
        });
      }

      setCurrentEnquiry(updatedEnquiry);
      if (onUpdateEnquiry) {
        onUpdateEnquiry(updatedEnquiry);
      }
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === enquiry.id ? updatedEnquiry : e)));
      }

      if (triggerToast) {
        triggerToast(`Attachment "${target.name}" removed successfully.`, 'info');
      }
    } catch (err: any) {
      console.error('Failed to remove attachment:', err);
      if (triggerToast) {
        triggerToast(`Failed to remove attachment: ${err.message || 'Unknown error'}`, 'error');
      }
    } finally {
      setDeletingAttachmentKey(null);
    }
  };

  const handlePromoteAttachmentToCloud = async (targetIndex: number) => {
    const attachments = enquiry.attachments || [];
    const target = attachments[targetIndex];
    if (!target) return;

    const storageConfig = activeWorkspace?.settings?.storage;
    if (!storageConfig?.supabaseUrl || !storageConfig?.supabaseAnonKey || !storageConfig?.bucket) {
      if (triggerToast) {
        triggerToast('Cloud storage is not configured for this workspace.', 'error');
      }
      return;
    }

    const key = target.storageKey || target.id || `att_${targetIndex}`;
    setPromotingAttachmentKey(key);

    try {
      let dataUrl = target.url;
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        dataUrl = await resolveAttachmentUrl(target);
      }

      if (!dataUrl || !dataUrl.startsWith('data:')) {
        if (triggerToast) {
          triggerToast(
            "This document is stored locally on the uploader's device and its content is not present in this browser to upload.",
            'error'
          );
        }
        return;
      }

      const fileObj = dataUrlToFile(dataUrl, target.name);
      const publicUrl = await uploadToSupabaseStorage(
        fileObj,
        {
          supabaseUrl: storageConfig.supabaseUrl,
          supabaseAnonKey: storageConfig.supabaseAnonKey,
          bucket: storageConfig.bucket
        }
      );

      // Clean up local blob
      if (target.storageKey) {
        deleteAttachmentBlob(target.storageKey).catch(() => {});
      }

      const updatedAttachments = attachments.map((att, i) =>
        i === targetIndex
          ? {
              ...att,
              url: publicUrl,
              isLocal: false,
              storageProvider: 'supabase' as const
            }
          : att
      );

      const updatedEnquiry: Enquiry = {
        ...enquiry,
        attachments: updatedAttachments
      };

      if (enquiry.id) {
        await safeUpdateDoc('enquiries', enquiry.id, {
          attachments: updatedAttachments
        });
      }

      setCurrentEnquiry(updatedEnquiry);
      if (onUpdateEnquiry) {
        onUpdateEnquiry(updatedEnquiry);
      }
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === enquiry.id ? updatedEnquiry : e)));
      }

      if (triggerToast) {
        triggerToast(`Promoted "${target.name}" to Cloud Storage!`, 'success');
      }
    } catch (err: any) {
      console.error('Failed to promote attachment to cloud:', err);
      if (triggerToast) {
        triggerToast(`Promotion failed: ${err.message || 'Unknown error'}`, 'error');
      }
    } finally {
      setPromotingAttachmentKey(null);
    }
  };

  // Direct file upload in EnquiryDetail using unified Custom Bucket helper
  const handleDetailFileUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !currentEnquiry.id) return;
    setIsUploadingDetailAttachment(true);
    try {
      const existing = currentEnquiry.attachments || [];
      const newAttachments: Attachment[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const uploaded = await uploadWorkspaceMediaAsset(
          file,
          'enquiries/rfq',
          activeWorkspace,
          {
            compressImage: true,
            maxDimension: 1400,
            quality: 0.85
          }
        );

        const storageKey =
          uploaded.storageKey ||
          getAttachmentStorageKey({ name: file.name, size: uploaded.size || file.size }, existing.length + i, currentEnquiry.id);

        newAttachments.push({
          name: file.name,
          size: uploaded.size || file.size,
          type: uploaded.type || file.type || 'application/pdf',
          url: uploaded.url,
          storageKey,
          uploadedAt: new Date().toISOString(),
          isLocal: uploaded.isLocal,
          storageProvider: uploaded.storageProvider,
          include_in_quote_annex: false,
          uploadedByUserName: user?.full_name || user?.username || user?.email || 'User'
        });
      }

      const combined = [...existing, ...newAttachments];
      const { firestoreAttachments, memoryAttachments } = await prepareAttachmentsForSave(combined, currentEnquiry.id);
      await safeUpdateDoc('enquiries', currentEnquiry.id, {
        attachments: firestoreAttachments || [],
        updatedAt: new Date().toISOString()
      });

      const updatedEnquiry: Enquiry = {
        ...currentEnquiry,
        attachments: memoryAttachments,
        updatedAt: new Date().toISOString()
      };
      setCurrentEnquiry(updatedEnquiry);
      if (onUpdateEnquiry) onUpdateEnquiry(updatedEnquiry);
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === currentEnquiry.id ? updatedEnquiry : e)));
      }
      if (triggerToast) {
        triggerToast(`Attached ${newAttachments.length} file(s) to Enquiry #${currentEnquiry.sn}.`, 'success');
      }
    } catch (err: any) {
      console.error('Failed uploading detail attachment:', err);
      if (triggerToast) {
        triggerToast(err?.message || 'Failed to upload file', 'error');
      }
    } finally {
      setIsUploadingDetailAttachment(false);
    }
  };

  // Toggle whether an RFQ attachment is automatically included in Quotation Studio Technical Annexes
  const handleToggleAttachmentQuoteAnnex = async (targetIndex: number) => {
    const attachments = currentEnquiry.attachments || [];
    const target = attachments[targetIndex];
    if (!target || !currentEnquiry.id) return;

    const nextVal = !target.include_in_quote_annex;
    const updatedAttachments = attachments.map((att, i) =>
      i === targetIndex ? { ...att, include_in_quote_annex: nextVal } : att
    );

    try {
      const { firestoreAttachments, memoryAttachments } = await prepareAttachmentsForSave(updatedAttachments, currentEnquiry.id);
      await safeUpdateDoc('enquiries', currentEnquiry.id, {
        attachments: firestoreAttachments || [],
        updatedAt: new Date().toISOString()
      });
      const updatedEnquiry: Enquiry = {
        ...currentEnquiry,
        attachments: memoryAttachments
      };
      setCurrentEnquiry(updatedEnquiry);
      if (onUpdateEnquiry) onUpdateEnquiry(updatedEnquiry);
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === currentEnquiry.id ? updatedEnquiry : e)));
      }
      if (triggerToast) {
        triggerToast(
          nextVal
            ? `"${target.name}" marked for inclusion in Quotation Annexes.`
            : `"${target.name}" removed from automatic Quotation Annexes.`,
          'info'
        );
      }
    } catch (err: any) {
      console.error('Failed toggling quote annex flag:', err);
    }
  };

  // Inline Line Items Manipulation Helpers
  const handleDraftItemChange = (idx: number, field: keyof LineItem, val: any) => {
    setDraftLineItems((prev) => {
      const next = [...prev];
      const item = { ...next[idx] };
      if (field === 'quantity' || field === 'unit_price') {
        const q = field === 'quantity' ? (Number(val) || 0) : (Number(item.quantity) || 0);
        const p = field === 'unit_price' ? (Number(val) || 0) : (Number(item.unit_price) || 0);
        (item as any)[field] = Number(val) || 0;
        item.total_price = Number((q * p).toFixed(2));
      } else if (field === 'cost_price') {
        item.cost_price = val === '' || val === null || val === undefined ? undefined : (Number(val) || 0);
      } else if (field === 'lead_time_note' || (field as string) === 'delivery_time' || (field as string) === 'lead_time') {
        const strVal = String(val ?? '');
        item.lead_time_note = strVal;
        (item as any).delivery_time = strVal;
        (item as any).lead_time = strVal;
        item.availability = strVal;
        if (!item.specifications) item.specifications = {};
        item.specifications['Delivery'] = strVal;
        item.specifications['Lead Time'] = strVal;
      } else {
        (item as any)[field] = val;
      }
      next[idx] = item;
      return next;
    });
  };

  const handleMoveDraftItem = (idx: number, direction: 'up' | 'down') => {
    setDraftLineItems((prev) => {
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const handleRemoveDraftItem = (idx: number) => {
    setDraftLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleQuickAddCatalogProduct = (p: Product) => {
    const isUSD = currentEnquiry.currency === 'USD';
    const rawSell = Number(p.unit_price) || 0;
    const unitPrice = rawSell > 0 ? Math.round((isUSD ? rawSell / 3.6725 : rawSell) * 100) / 100 : 0;
    const rawCost = Number(p.cost_price ?? p.cost_price_aed) || 0;
    const costPrice = rawCost > 0 ? Math.round((isUSD ? rawCost / 3.6725 : rawCost) * 100) / 100 : undefined;
    const availStock = (p.stock_on_hand || 0) - (p.stock_reserved || 0);
    const defaultLead =
      p.default_availability?.trim() ||
      (p.is_inventoried && availStock > 0 ? 'Ex-Stock' : '2–3 Weeks');

    const clonedSubComponents =
      p.is_composite_set && Array.isArray(p.sub_components) && p.sub_components.length > 0
        ? p.sub_components.map((sc, idx) => ({
            ...sc,
            id: `comp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
            unit_price:
              sc.unit_price !== undefined
                ? Math.round((isUSD ? Number(sc.unit_price) / 3.6725 : Number(sc.unit_price)) * 100) / 100
                : 0,
            cost_price:
              sc.cost_price !== undefined
                ? Math.round((isUSD ? Number(sc.cost_price) / 3.6725 : Number(sc.cost_price)) * 100) / 100
                : undefined
          }))
        : undefined;
    const bomRollup = clonedSubComponents
      ? recalculateCompositeItemTotals(clonedSubComponents, 1, unitPrice, costPrice)
      : null;
    const resolvedUnitPrice =
      bomRollup && bomRollup.unitSellingPrice > 0 ? bomRollup.unitSellingPrice : unitPrice;
    const resolvedCostPrice =
      bomRollup && bomRollup.unitCostPrice > 0 ? bomRollup.unitCostPrice : costPrice;

    const newItem: LineItem = {
      id: `li_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      product_id: p.id,
      sku: p.sku || undefined,
      item_name: p.name || p.product_type,
      item_type: 'product',
      product_type: p.product_type || 'Other',
      description: compileDescriptionWithSpecs(p.name || '', p.description || '', p.attributes || []) || p.description || p.name || '',
      quantity: 1,
      unit: p.unit || (p.is_composite_set ? 'SET' : 'Nos'),
      unit_price: resolvedUnitPrice,
      cost_price: resolvedCostPrice,
      total_price: resolvedUnitPrice,
      brand_make: p.brand_make || undefined,
      model_part_no: p.model_part_no || undefined,
      country_of_origin: p.country_of_origin || undefined,
      hs_code: p.hs_code || undefined,
      image_url: p.image_url || undefined,
      secondary_image_url: p.secondary_image_url || undefined,
      image_caption: p.image_caption || undefined,
      secondary_image_caption: p.secondary_image_caption || undefined,
      image_adjustments: p.image_adjustments || undefined,
      datasheet_attachment: p.datasheet_attachment || undefined,
      include_datasheet_in_quote: p.datasheet_attachment ? true : undefined,
      lead_time_note: defaultLead,
      option: activeOptionTab !== 'ALL' ? activeOptionTab : 'Default / Included',
      attributes: p.attributes ? [...p.attributes] : [],
      ...(p.is_composite_set ? { is_composite_set: true } : {}),
      ...(bomRollup ? { sub_components: bomRollup.normalizedComponents } : {}),
      ...(p.package_pricing_mode ? { package_pricing_mode: p.package_pricing_mode } : {}),
      ...(p.option_scope_notes ? { option_scope_notes: p.option_scope_notes } : {})
    };

    setDraftLineItems((prev) => [...prev, newItem]);
    setIsInlineEditingItems(true);
    setShowQuickCatalogPicker(false);
    if (triggerToast) {
      triggerToast(`Added "${p.name || p.product_type}" to Line Items. Click Save Items to persist.`, 'info');
    }
  };

  const handleQuickAddCustomItem = () => {
    const newItem: LineItem = {
      id: `li_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      item_name: 'Custom Line Item',
      item_type: 'product',
      product_type: 'Other',
      description: '',
      quantity: 1,
      unit: 'Nos',
      unit_price: 0,
      total_price: 0,
      lead_time_note: 'Standard',
      option: activeOptionTab !== 'ALL' ? activeOptionTab : 'Default / Included',
      attributes: []
    };
    setDraftLineItems((prev) => [...prev, newItem]);
    setIsInlineEditingItems(true);
  };

  const handleSaveInlineLineItems = async () => {
    if (!currentEnquiry.id) return;
    setIsSavingInlineItems(true);
    try {
      // Calculate updated baseline package total
      let baselineSum = 0;
      draftLineItems.forEach((li) => {
        const opt = ((li as any).option_designation || li.option || 'Default / Included').trim();
        const isBaseline = !opt || opt === 'Default / Included' || opt === 'Option A' || opt.startsWith('Option A ');
        if (isBaseline) {
          const isDisc = li.item_type === 'discount' || (li as any).classification === 'Discount / Rebate';
          const lineTot = Number(li.total_price) || (Number(li.quantity) || 0) * (Number(li.unit_price) || 0);
          baselineSum += isDisc ? -Math.abs(lineTot) : lineTot;
        }
      });

      const isUSD = currentEnquiry.currency === 'USD';
      const nextValueAed = currentEnquiry.is_lump_sum
        ? currentEnquiry.value_aed
        : Math.max(0, Math.round((isUSD ? baselineSum * 3.6725 : baselineSum) * 100) / 100);

      const now = new Date().toISOString();
      const strippedLineItems = stripCatalogRedundantLineItemMedia(draftLineItems, products);
      const updatedPayload: Partial<Enquiry> = {
        line_items: strippedLineItems,
        value_aed: nextValueAed,
        updatedAt: now
      };

      await safeUpdateDoc('enquiries', currentEnquiry.id, updatedPayload);
      const updatedEnquiry: Enquiry = {
        ...currentEnquiry,
        ...updatedPayload,
        line_items: rehydrateLineItemsFromCatalog(strippedLineItems, products)
      };
      await EnquiryRepository.save(updatedEnquiry);

      setCurrentEnquiry(updatedEnquiry);
      if (onUpdateEnquiry) onUpdateEnquiry(updatedEnquiry);
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === currentEnquiry.id ? updatedEnquiry : e)));
      }
      setIsInlineEditingItems(false);

      if (quotations.length > 0) {
        const draftQuotes = quotations.filter(
          (q) => !q.is_deleted && (!q.document_type || q.document_type === 'quotation') && (q.status || 'Draft') === 'Draft'
        );
        if (draftQuotes.length > 0) {
          const mappedQuoteItems = buildBaseLineItemsFromSource(null, updatedEnquiry);
          const syncedDrafts: Quotation[] = [];
          for (const dq of draftQuotes) {
            const mergedItems: QuotationLineItem[] = mappedQuoteItems.map((freshIt, idx) => {
              const prevIt =
                (dq.line_items || []).find(
                  (oldIt) =>
                    (oldIt.id && freshIt.id && oldIt.id === freshIt.id) ||
                    (oldIt.product_id && freshIt.product_id && oldIt.product_id === freshIt.product_id && oldIt.sn === idx + 1)
                ) || (dq.line_items || [])[idx];
              return {
                ...(prevIt || {}),
                ...freshIt,
                page_break_after: prevIt?.page_break_after,
                visible_attributes: prevIt?.visible_attributes
              };
            });
            const totals = QuotationRepository.calculateTotals(
              mergedItems,
              dq.freight_amount || 0,
              dq.tax_mode || 'taxes_extra',
              dq.tax_rate_percent ?? 5
            );
            const nextDraft: Quotation = {
              ...dq,
              line_items: mergedItems,
              subtotal: totals.subtotal,
              freight_amount: totals.freight_amount,
              tax_rate_percent: totals.tax_rate_percent,
              tax_amount: totals.tax_amount,
              grand_total: totals.grand_total,
              updatedAt: now,
              updated_at: now
            };
            await QuotationRepository.saveQuotation(nextDraft).catch(() => {});
            syncedDrafts.push(nextDraft);
          }
          if (syncedDrafts.length > 0) {
            setQuotations((prev) =>
              prev.map((q) => {
                const match = syncedDrafts.find((sd) => sd.id === q.id);
                return match || q;
              })
            );
          }
        } else {
          setShowQuoteSyncPrompt(true);
        }
      }

      if (triggerToast) {
        triggerToast(`Saved ${draftLineItems.length} line item(s) on Enquiry #${currentEnquiry.sn}.`, 'success');
      }
    } catch (err: any) {
      console.error('Failed saving inline line items:', err);
      if (triggerToast) {
        triggerToast(err?.message || 'Failed to save line items', 'error');
      }
    } finally {
      setIsSavingInlineItems(false);
    }
  };

  // Upload Product Image or Technical Datasheet for a Draft Line Item in Quick Edit
  const handleInlineItemMediaUpload = async (idx: number, file: File, mediaType: 'image' | 'datasheet') => {
    try {
      const existingItem = draftLineItems[idx];
      const previousUrlToDelete =
        mediaType === 'image'
          ? existingItem?.image_url
          : existingItem?.datasheet_attachment?.url;
      const uploaded = await uploadWorkspaceMediaAsset(
        file,
        mediaType === 'image' ? 'product_images' : 'product_datasheets',
        activeWorkspace,
        {
          compressImage: mediaType === 'image',
          maxDimension: 800,
          quality: 0.78,
          previousUrlToDelete
        }
      );
      if (mediaType === 'image') {
        handleDraftItemChange(idx, 'image_url', uploaded.url);
        if (triggerToast) triggerToast('Product image uploaded to Custom Bucket.', 'success');
      } else {
        handleDraftItemChange(idx, 'datasheet_attachment', uploaded);
        handleDraftItemChange(idx, 'include_datasheet_in_quote', true);
        if (triggerToast) triggerToast('Technical datasheet uploaded to Custom Bucket.', 'success');
      }
    } catch (err: any) {
      console.error('Inline item media upload failed:', err);
      if (triggerToast) triggerToast(err?.message || 'Failed uploading media file.', 'error');
    } finally {
      setUploadingInlineItemMedia(null);
    }
  };

  // Bulk clean up legacy line items that have empty item_name and full text in description
  const handleCleanUpLegacyTitles = () => {
    const source = isInlineEditingItems ? draftLineItems : (currentEnquiry.line_items || []);
    let splitCount = 0;
    const cleaned = source.map((li) => {
      if (!(li.item_name || '').trim() && (li.description || '').trim()) {
        const parsed = parseLineItemTitleAndSpec(li.item_name, li.description);
        if (parsed.title) {
          splitCount++;
          return {
            ...li,
            item_name: parsed.title,
            description: parsed.spec
          };
        }
      }
      return li;
    });
    setDraftLineItems(cleaned);
    setIsInlineEditingItems(true);
    if (triggerToast) {
      triggerToast(`Cleaned up ${splitCount} legacy item title(s). Click Save Items to persist.`, 'info');
    }
  };

  // Bulk apply Delivery / Lead Time or Country of Origin across all line items in 1 click
  const handleBulkApplyFieldToLineItems = async (
    field: 'delivery' | 'origin',
    rawValue: string
  ) => {
    const val = rawValue.trim();
    if (!val) return;
    const baseSource = isInlineEditingItems ? draftLineItems : (currentEnquiry.line_items || []);
    if (baseSource.length === 0) return;

    const updatedItems: LineItem[] = baseSource.map((item) => {
      if (field === 'delivery') {
        return {
          ...item,
          lead_time_note: val,
          delivery_time: val,
          lead_time: val,
          availability: val,
          specifications: {
            ...(item.specifications || {}),
            Delivery: val,
            'Lead Time': val
          }
        };
      }
      return {
        ...item,
        country_of_origin: val
      };
    });

    setDraftLineItems(updatedItems);
    setShowBulkApplyPopover(false);

    if (isInlineEditingItems) {
      triggerToast?.(
        `Applied ${field === 'delivery' ? 'Delivery' : 'Origin'} "${val}" to all ${updatedItems.length} draft items. Click Save Items to persist.`,
        'info'
      );
      return;
    }

    const updatedEnq: Enquiry = {
      ...currentEnquiry,
      line_items: updatedItems,
      updatedAt: new Date().toISOString()
    };
    setCurrentEnquiry(updatedEnq);
    if (onUpdateEnquiry) onUpdateEnquiry(updatedEnq);
    if (setEnquiries) {
      setEnquiries((prev) => prev.map((e) => (e.id === updatedEnq.id ? updatedEnq : e)));
    }

    if (currentEnquiry.id) {
      try {
        await safeUpdateDoc('enquiries', currentEnquiry.id, {
          line_items: stripCatalogRedundantLineItemMedia(updatedItems, products),
          updatedAt: updatedEnq.updatedAt
        });
        await EnquiryRepository.save(updatedEnq, activeWorkspace?.id);
        // Also update any active Draft quotations for this enquiry
        const draftQuotes = quotations.filter(
          (q) =>
            !q.is_deleted &&
            String(q.status || 'Draft').toLowerCase() === 'draft' &&
            (q.document_type || 'quotation') === 'quotation'
        );
        for (const dq of draftQuotes) {
          if (!dq.id) continue;
          const nextQItems = (dq.line_items || []).map((qi) =>
            field === 'delivery'
              ? { ...qi, availability: val, lead_time_note: val }
              : { ...qi, country_of_origin: val }
          );
          await QuotationRepository.updateQuotation(dq.id, {
            line_items: nextQItems,
            updated_at: new Date().toISOString()
          });
          setQuotations((prev) =>
            prev.map((q) => (q.id === dq.id ? { ...q, line_items: nextQItems } : q))
          );
        }
      } catch (err) {
        console.warn('[EnquiryDetail] Bulk apply persist notice:', err);
      }
    }

    triggerToast?.(
      `Applied ${field === 'delivery' ? 'Delivery / Lead Time' : 'Country of Origin'} "${val}" to all ${updatedItems.length} items!`,
      'success'
    );
  };

  // Sync updated Enquiry Line Items into an active Draft Quotation or fork a new Revision (R2 / R(N+1))
  const handleSyncLineItemsToQuote = async (mode: 'sync_draft' | 'new_revision') => {
    if (quotations.length === 0) return;
    setIsSyncingQuoteItems(true);
    try {
      const mappedQuoteItems: QuotationLineItem[] = (currentEnquiry.line_items || []).map((li, idx) => {
        const rawOpt = String((li as any).option_designation || li.option || '').trim();
        const isOptionalOrAlt =
          rawOpt.toLowerCase().includes('optional') ||
          rawOpt.toLowerCase().includes('add-on') ||
          /option\s+[b-z]/i.test(rawOpt);
        const parsed = parseLineItemTitleAndSpec(li.item_name, li.description);
        return {
          id: li.id || `item_${idx + 1}`,
          sn: idx + 1,
          product_id: li.product_id,
          sku: li.sku,
          item_name: parsed.title || li.product_type || `Item ${idx + 1}`,
          description: parsed.spec || '',
          brand_make: li.brand_make,
          model_part_no: li.model_part_no,
          country_of_origin: li.country_of_origin,
          hs_code: li.hs_code,
          availability:
            (li.lead_time_note && li.lead_time_note !== 'Ex-Stock / Standard' ? li.lead_time_note : '') ||
            currentEnquiry.delivery_period ||
            li.lead_time_note ||
            'Ex-Stock / Standard',
          quantity: Number(li.quantity) || 1,
          unit: li.unit || 'Nos',
          unit_price: Number(li.unit_price) || 0,
          line_total: Number(li.total_price) || (Number(li.quantity) || 1) * (Number(li.unit_price) || 0),
          is_optional: isOptionalOrAlt,
          option_group: rawOpt && rawOpt !== 'Default / Included' && rawOpt !== 'Baseline / All' ? rawOpt : undefined,
          attributes: li.attributes || [],
          image_url: li.image_url,
          secondary_image_url: li.secondary_image_url,
          image_caption: li.image_caption,
          secondary_image_caption: li.secondary_image_caption,
          image_adjustments: li.image_adjustments,
          image_display_override: li.image_display_override,
          image_size_override: li.image_size_override,
          image_aspect_override: li.image_aspect_override,
          datasheet_attachment: li.datasheet_attachment,
          include_datasheet_in_quote: li.include_datasheet_in_quote !== false,
          ...(li.is_composite_set ? { is_composite_set: true } : {}),
          ...(Array.isArray(li.sub_components) && li.sub_components.length > 0
            ? { sub_components: li.sub_components }
            : {}),
          ...(li.package_pricing_mode ? { package_pricing_mode: li.package_pricing_mode } : {}),
          ...(li.option_scope_notes ? { option_scope_notes: li.option_scope_notes } : {})
        };
      });

      const targetDraft = quotations.find((q) => q.status === 'Draft') || quotations[0];

      if (mode === 'sync_draft' && targetDraft?.id) {
        const totals = QuotationRepository.calculateTotals(
          mappedQuoteItems,
          targetDraft.freight_amount || 0,
          targetDraft.tax_mode || 'tax_calculated',
          targetDraft.tax_rate_percent ?? 5
        );
        const updatedQuote: Quotation = {
          ...targetDraft,
          line_items: mappedQuoteItems,
          subtotal: totals.subtotal,
          freight_amount: totals.freight_amount,
          tax_rate_percent: totals.tax_rate_percent,
          tax_amount: totals.tax_amount,
          grand_total: totals.grand_total
        };
        await QuotationRepository.saveQuotation(updatedQuote);
        setQuotations((prev) => prev.map((q) => (q.id === updatedQuote.id ? updatedQuote : q)));
        setShowQuoteSyncPrompt(false);
        setEditingQuotation(updatedQuote);
        setIsQuotationStudioOpen(true);
        if (triggerToast) {
          triggerToast(`Synced ${mappedQuoteItems.length} line items into ${updatedQuote.formatted_quote_ref}.`, 'success');
        }
      } else {
        const latestQuote = quotations[0];
        if (!latestQuote?.id) return;
        const nextRev = await QuotationRepository.createRevision(latestQuote.id);
        const totals = QuotationRepository.calculateTotals(
          mappedQuoteItems,
          nextRev.freight_amount || 0,
          nextRev.tax_mode || 'tax_calculated',
          nextRev.tax_rate_percent ?? 5
        );
        const updatedNextRev: Quotation = {
          ...nextRev,
          line_items: mappedQuoteItems,
          subtotal: totals.subtotal,
          freight_amount: totals.freight_amount,
          tax_rate_percent: totals.tax_rate_percent,
          tax_amount: totals.tax_amount,
          grand_total: totals.grand_total
        };
        await QuotationRepository.saveQuotation(updatedNextRev);
        setQuotations((prev) => [
          updatedNextRev,
          ...prev.map((item) =>
            item.id === latestQuote.id ? { ...item, status: 'Superseded' as const } : item
          )
        ]);
        setShowQuoteSyncPrompt(false);
        setEditingQuotation(updatedNextRev);
        setIsQuotationStudioOpen(true);
        if (triggerToast) {
          triggerToast(`Created new revision ${updatedNextRev.formatted_quote_ref} with updated line items.`, 'success');
        }
      }
    } catch (err: any) {
      console.error('Failed syncing line items to quotation:', err);
      if (triggerToast) {
        triggerToast(err?.message || 'Failed to sync quotation', 'error');
      }
    } finally {
      setIsSyncingQuoteItems(false);
    }
  };

  // Strict Zero-Trust Audit: Force close if workspace changes or mismatch detected
  useEffect(() => {
    const currentWsId = activeWorkspaceId || activeWorkspace?.id;
    if (currentWsId && enquiry.workspace_id && enquiry.workspace_id !== currentWsId) {
      onClose();
    }
  }, [activeWorkspaceId, activeWorkspace?.id, enquiry.workspace_id, onClose]);

  const toggleLineItem = (idx: number) => {
    setExpandedItemIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const toggleExpandAllItems = () => {
    const baseItems = currentEnquiry.line_items || [];
    const targetItems = filteredLineItems.length > 0 ? filteredLineItems : baseItems;
    if (targetItems.length === 0) return;
    const allExpanded = targetItems.every((item) => {
      const origIdx = baseItems.indexOf(item);
      return origIdx >= 0 ? !!expandedItemIndices[origIdx] : false;
    });

    if (allExpanded) {
      setExpandedItemIndices((prev) => {
        const next = { ...prev };
        targetItems.forEach((item) => {
          const origIdx = baseItems.indexOf(item);
          if (origIdx >= 0) delete next[origIdx];
        });
        return next;
      });
    } else {
      setExpandedItemIndices((prev) => {
        const next = { ...prev };
        targetItems.forEach((item) => {
          const origIdx = baseItems.indexOf(item);
          if (origIdx >= 0) next[origIdx] = true;
        });
        return next;
      });
    }
  };

  // Custom confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: (selectedOption?: string) => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    variant?: 'destructive' | 'warning' | 'success' | 'default';
    selectableOptions?: string[];
    selectedOption?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const matchedCompany = companies.find((c) => c.id === (currentEnquiry.company_id || enquiry.company_id));
  const matchedContact = contacts.find((c) => c.id === (currentEnquiry.contact_id || enquiry.contact_id));

  const studioSpName = useMemo(
    () => currentEnquiry.assigned_salesperson || resolveSalespersonName(currentEnquiry, salespersons),
    [currentEnquiry, salespersons]
  );

  const handleOutsideQuickPrint = async (q: Quotation) => {
    try {
      const rehydrated = await rehydrateDocumentBlobsFromLocal(q);
      const catalogHydratedItems = rehydrateLineItemsFromCatalog(rehydrated.line_items || [], products || []);
      const enrichedItems = catalogHydratedItems.map((it, idx) => {
        const matchingEnqItem =
          (currentEnquiry.line_items || []).find(
            (li) =>
              (li.id && it.id && li.id === it.id) ||
              (li.product_id && it.product_id && li.product_id === it.product_id) ||
              (li.sku && it.sku && li.sku.trim().toLowerCase() === it.sku.trim().toLowerCase())
          ) || (currentEnquiry.line_items || [])[idx];
        const matchingProd = (products || []).find(
          (p) =>
            (it.product_id && p.id === it.product_id) ||
            (matchingEnqItem?.product_id && p.id === matchingEnqItem.product_id) ||
            (it.sku && p.sku && p.sku.trim().toLowerCase() === it.sku.trim().toLowerCase())
        );
        return {
          ...it,
          image_url: it.image_url || matchingEnqItem?.image_url || matchingProd?.image_url,
          secondary_image_url:
            it.secondary_image_url || matchingEnqItem?.secondary_image_url || matchingProd?.secondary_image_url,
          brand_make: it.brand_make || matchingEnqItem?.brand_make || matchingProd?.brand_make || matchingProd?.brand,
          model_part_no:
            it.model_part_no || matchingEnqItem?.model_part_no || matchingProd?.model_part_no || matchingProd?.part_no,
          country_of_origin:
            it.country_of_origin || matchingEnqItem?.country_of_origin || matchingProd?.country_of_origin,
          availability:
            (it.availability && it.availability !== 'Ex-Stock / Standard' ? it.availability : '') ||
            (it.lead_time_note && it.lead_time_note !== 'Ex-Stock / Standard' ? it.lead_time_note : '') ||
            (matchingEnqItem?.lead_time_note && matchingEnqItem.lead_time_note !== 'Ex-Stock / Standard' ? matchingEnqItem.lead_time_note : '') ||
            ((matchingEnqItem as any)?.availability && (matchingEnqItem as any).availability !== 'Ex-Stock / Standard' ? (matchingEnqItem as any).availability : '') ||
            matchingProd?.default_availability ||
            rehydrated.delivery_period ||
            currentEnquiry.delivery_period ||
            it.availability ||
            it.lead_time_note ||
            'Ex-Stock / Standard'
        };
      });
      const hydratedQuote: Quotation = {
        ...rehydrated,
        line_items: enrichedItems
      };

      const originalTitle = document.title;
      const resolvedPdfName = resolvePdfFilename(
        hydratedQuote.pdf_filename_pattern || documentProfile?.pdf_filename_pattern,
        {
          quotation: hydratedQuote,
          enquiry: currentEnquiry,
          profile: documentProfile
        }
      );
      if (resolvedPdfName) {
        document.title = resolvedPdfName;
      }

      setViewingQuotation(hydratedQuote);

      const cleanup = () => {
        document.title = originalTitle;
        setViewingQuotation(null);
      };
      window.addEventListener('afterprint', cleanup, { once: true });

      await new Promise<void>((resolve) => setTimeout(resolve, 120));
      const portalEl = document.getElementById('quotation-print-portal');
      if (portalEl) {
        const imgs = Array.from(portalEl.querySelectorAll('img')).filter((img) => {
          const src = img.getAttribute('src') || '';
          return Boolean(src.trim());
        });
        if (imgs.length > 0) {
          await Promise.race([
            Promise.all(
              imgs.map(
                (img) =>
                  new Promise<void>((res) => {
                    if (img.complete && img.naturalWidth > 0) {
                      res();
                      return;
                    }
                    const done = () => {
                      img.removeEventListener('load', done);
                      img.removeEventListener('error', done);
                      res();
                    };
                    img.addEventListener('load', done, { once: true });
                    img.addEventListener('error', done, { once: true });
                  })
              )
            ),
            new Promise<void>((res) => setTimeout(res, 1500))
          ]);
        }
      }
      window.print();
    } catch (err) {
      console.warn('[EnquiryDetail] Quick print hydration fallback:', err);
      setViewingQuotation(q);
      setTimeout(() => window.print(), 200);
    }
  };

  const enrichedEnquiry = useMemo<Enquiry>(() => {
    const contactName =
      currentEnquiry.contact_person_name ||
      matchedContact?.full_name ||
      (matchedContact as any)?.name ||
      currentEnquiry.concerned_person ||
      (Array.isArray(currentEnquiry.concerned_persons) && currentEnquiry.concerned_persons[0]) ||
      '';
    return {
      ...currentEnquiry,
      contact_person_name: contactName || undefined,
      concerned_person: contactName || currentEnquiry.concerned_person,
      assigned_salesperson: studioSpName || undefined,
      subject: currentEnquiry.subject || ''
    };
  }, [currentEnquiry, matchedContact, studioSpName]);

  // Company pairing & creation modal states
  const [isCreateCompanyModalOpen, setIsCreateCompanyModalOpen] = useState(false);
  const [isPairCompanyDropdownOpen, setIsPairCompanyDropdownOpen] = useState(false);
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false);

  // UX-M5: Close More Actions menu on Escape key in capture phase before parent drawer closes
  useEffect(() => {
    if (!isMoreActionsOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setIsMoreActionsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isMoreActionsOpen]);

  // Unpaired company duplicate match check
  const unpairedCompanyName = currentEnquiry.company_name || (currentEnquiry as any)?.company || enquiry.company_name || '';
  const candidateCompanyMatch = useMemo(() => {
    if (matchedCompany || !unpairedCompanyName || unpairedCompanyName.trim().length < 2) return null;
    return findDuplicateCompany(unpairedCompanyName.trim(), companies);
  }, [matchedCompany, unpairedCompanyName, companies]);

  const handlePairCompany = async (targetCompany: Company) => {
    if (!currentEnquiry?.id || !targetCompany?.id) return;
    try {
      let nextQuoteRef = currentEnquiry.quote_ref_no || '';
      if (nextQuoteRef.includes('[COMPANY_CODE]') && targetCompany.company_code?.trim()) {
        nextQuoteRef = nextQuoteRef.replace(
          /\[COMPANY_CODE\]/g,
          targetCompany.company_code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
        );
      }
      if (nextQuoteRef.includes('[COUNTRY]') && (targetCompany.country_code || targetCompany.country)) {
        const rawCtry = (targetCompany.country_code || targetCompany.country || 'UAE').trim().toUpperCase();
        const ctryCode = rawCtry.length <= 4 ? rawCtry : 'UAE';
        nextQuoteRef = nextQuoteRef.replace(/\[COUNTRY\]/g, ctryCode);
      }

      const updatedPayload: Partial<Enquiry> = {
        company_id: targetCompany.id,
        company_name: targetCompany.display_name || targetCompany.canonical_name,
        ...(targetCompany.country && !currentEnquiry.country ? { country: targetCompany.country } : {}),
        ...(nextQuoteRef && nextQuoteRef !== currentEnquiry.quote_ref_no ? { quote_ref_no: nextQuoteRef } : {}),
        updatedAt: new Date().toISOString()
      };
      await safeUpdateDoc('enquiries', currentEnquiry.id, updatedPayload);
      const updatedEnquiry = { ...currentEnquiry, ...updatedPayload };
      setCurrentEnquiry(updatedEnquiry);
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === currentEnquiry.id ? updatedEnquiry : e)));
      }
      try {
        await recordAuditLog({
          document_id: currentEnquiry.id,
          entity_type: 'enquiry',
          entity_title: `Enquiry #${currentEnquiry.sn}`,
          action: 'update',
          user,
          after: updatedPayload,
          details: `Paired enquiry #${currentEnquiry.sn} with company "${targetCompany.display_name || targetCompany.canonical_name}"`
        });
      } catch (aErr) {
        console.warn('Audit error:', aErr);
      }
      if (triggerToast) {
        triggerToast(`Enquiry paired with ${targetCompany.display_name || targetCompany.canonical_name}`, 'success');
      }
      setIsPairCompanyDropdownOpen(false);
      setIsCreateCompanyModalOpen(false);
    } catch (err: any) {
      console.error('Error pairing company:', err);
      alert('Failed to pair company: ' + err.message);
    }
  };

  // Resolve stakeholders / concerned persons with legacy string fallback
  const rawConcerned = currentEnquiry.concerned_persons || enquiry.concerned_persons;
  const rawConcernedLegacy = currentEnquiry.concerned_person || enquiry.concerned_person;
  const resolvedConcernedPersons: string[] = React.useMemo(() => {
    if (Array.isArray(rawConcerned) && rawConcerned.length > 0) {
      return rawConcerned.map(p => String(p).trim()).filter(Boolean);
    }
    if (typeof rawConcernedLegacy === 'string' && rawConcernedLegacy.trim()) {
      return rawConcernedLegacy.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
    }
    return [];
  }, [rawConcerned, rawConcernedLegacy]);

  // Compute the chronological list of revisions
  const revisionChain = React.useMemo(() => {
    if (!enquiries || enquiries.length === 0) return [enquiry];

    let root = enquiry;
    const maxDepth = 50;
    let depth = 0;
    while (root.parent_id && depth < maxDepth) {
      const parent = enquiries.find((e) => e.id === root.parent_id);
      if (!parent) break;
      root = parent;
      depth++;
    }

    const rootId = root.id;
    if (!rootId) return [enquiry];

    // Find all non-deleted linked enquiries sharing this root or having this parent
    const linked = enquiries.filter((e) => !e.is_deleted && (e.id === rootId || e.parent_id === rootId));
    if (linked.length === 0) return [currentEnquiry];

    return linked.sort((a, b) => {
      const revA = a.revision_number ?? 0;
      const revB = b.revision_number ?? 0;
      if (revA !== revB) return revA - revB;
      return (a.sn || 0) - (b.sn || 0);
    });
  }, [enquiries, enquiry, currentEnquiry]);

  // WORKFLOW 1: "Create Revision" — Retains the SAME Enquiry ID and S/N (#26), increments proposal revision (-R1 -> -R2),
  // and logs the revision in the Commercial Documents Hub history.
  const handleCreateRevision = async () => {
    const currentWsId = activeWorkspaceId || activeWorkspace?.id;
    if (!currentWsId) {
      if (triggerToast) triggerToast('Active workspace context lost. Cannot create revision.', 'error');
      return;
    }
    const userRole = getUserWorkspaceRole(user, currentWsId, activeWorkspace);
    if (userRole === 'Viewer') {
      if (triggerToast) triggerToast('Access Denied: Viewers do not have permission to generate or mutate proposals.', 'error');
      return;
    }

    const enquiryId = currentEnquiry.id || (currentEnquiry as any)._id;
    if (!enquiryId) {
      if (triggerToast) triggerToast('Cannot create revision: Enquiry ID missing.', 'error');
      return;
    }

    try {
      const existingClientQuotes = quotations
        .filter((q) => !q.is_deleted && (q.document_type || 'quotation') === 'quotation')
        .sort((a, b) => (b.revision_number || 1) - (a.revision_number || 1));

      let nextRevQuote: Quotation;

      if (existingClientQuotes.length > 0 && existingClientQuotes[0].id) {
        // Fork the latest saved quotation revision (marks previous as Superseded and creates R(n+1))
        nextRevQuote = await QuotationRepository.createRevision(existingClientQuotes[0].id);
        setQuotations((prev) => [
          nextRevQuote,
          ...prev.map((item) =>
            item.id === existingClientQuotes[0].id ? { ...item, status: 'Superseded' as const } : item
          )
        ]);
      } else {
        // Materialize baseline R1 as Superseded in QuotationRepository, then fork R2 as Draft
        const currentRevNum = Math.max(1, Number(currentEnquiry.revision_number) || 1);
        const baselineSynth = buildSynthesizedQuotationFromEnquiry(currentEnquiry, currentRevNum);
        const {
          _isBaselineEnquiryProposal,
          _linkedEnquiryId,
          ...cleanBaselineQuote
        } = baselineSynth as any;
        const r1ToSave: Quotation = {
          ...cleanBaselineQuote,
          id: `qt_${Date.now()}_r${currentRevNum}`,
          status: 'Superseded',
          revision_number: currentRevNum
        };
        const savedR1 = await QuotationRepository.saveQuotation(r1ToSave);
        nextRevQuote = await QuotationRepository.createRevision(savedR1.id!);
        setQuotations((prev) => [nextRevQuote, { ...savedR1, status: 'Superseded' as const }, ...prev]);
      }

      const nowIso = new Date().toISOString();
      const updatedPatch: Partial<Enquiry> & Record<string, any> = {
        revision_number: nextRevQuote.revision_number,
        quote_ref_no: nextRevQuote.formatted_quote_ref,
        latest_quote_ref: nextRevQuote.formatted_quote_ref,
        latest_revision_number: nextRevQuote.revision_number,
        active_quotation_id: nextRevQuote.id,
        updatedAt: nowIso
      };

      await safeUpdateDoc('enquiries', enquiryId, updatedPatch);
      const updatedEnquiryRecord: Enquiry = {
        ...currentEnquiry,
        ...updatedPatch,
        sn: currentEnquiry.sn // Explicitly retain the exact same S/N (#26)
      };
      await EnquiryRepository.save(updatedEnquiryRecord).catch(() => {});
      setCurrentEnquiry(updatedEnquiryRecord);
      if (onUpdateEnquiry) onUpdateEnquiry(updatedEnquiryRecord);
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === enquiryId ? updatedEnquiryRecord : e)));
      }

      if (triggerToast) {
        triggerToast(
          `Created Proposal Revision R${nextRevQuote.revision_number} (${nextRevQuote.formatted_quote_ref}) on Enquiry #${currentEnquiry.sn}`,
          'success'
        );
      }
    } catch (err: any) {
      console.error('Failed to create proposal revision:', err);
      if (triggerToast) {
        triggerToast(err?.message || 'Failed to create proposal revision', 'error');
      }
    }
  };

  // WORKFLOW 2: "Duplicate as New Enquiry" — Explicitly creates a NEW Enquiry record with the next S/N (#27),
  // generates a fresh base reference code (never copying the old -R1 ref), and resets customer dates.
  const handleDuplicateAsNewEnquiry = () => {
    const currentWsId = activeWorkspaceId || activeWorkspace?.id;
    if (!currentWsId) {
      if (triggerToast) triggerToast('Active workspace context lost. Cannot duplicate enquiry.', 'error');
      return;
    }
    const userRole = getUserWorkspaceRole(user, currentWsId, activeWorkspace);
    if (userRole === 'Viewer') {
      if (triggerToast) triggerToast('Access Denied: Viewers do not have permission to duplicate enquiries.', 'error');
      return;
    }

    // Find next S/N across non-deleted workspace enquiries
    const maxSn = (enquiries || [])
      .filter((e) => !e.is_deleted)
      .reduce((max, e) => Math.max(max, Number(e.sn) || 0), Number(currentEnquiry.sn) || 0);
    const nextSn = maxSn + 1;
    const todayIso = new Date().toISOString().split('T')[0];

    const {
      id,
      _id,
      parent_id,
      createdAt,
      updatedAt,
      stock_reserved,
      stock_reserved_at,
      project_id,
      project_number,
      active_quotation_id,
      quotation_status,
      latest_quote_ref,
      latest_revision_number,
      wonAt,
      lostAt,
      sentAt,
      statusHistory,
      invoice_po_no,
      payment_status,
      ...clonedData
    } = currentEnquiry as any;

    const duplicatePayload: Enquiry = {
      ...clonedData,
      workspace_id: currentWsId,
      id: undefined,
      parent_id: undefined,
      revision_number: 0,
      sn: nextSn,
      quote_ref_no: '', // Empty so EnquiryForm auto-generates a fresh base reference code for the new S/N
      enquiry_date: todayIso,
      logged_date: todayIso,
      projected_order_date: '',
      next_followup_date: '',
      status: 'Active',
      stock_reserved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (triggerToast) {
      triggerToast(`Duplicating deal as New Enquiry #${nextSn} with fresh reference code & reset dates...`, 'info');
    }
    onEditEnquiry(duplicatePayload);
    onClose();
  };

  // Filter audit logs for this specific enquiry
  const recordLogs = auditLogs
    .filter((log) => log.document_id === enquiry.id && log.entity_type === 'enquiry')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date().getTime()); // Newest first

  const isBasicTier = user.role !== 'Admin' && user.dataVisibilityTier === 'BASIC';
  const isOwnerOrAttributed = isRecordOwner(user, currentEnquiry);
  const isMaskedForBasic = isBasicTier && !isOwnerOrAttributed;
  const isCreatorOnly = isCreatorOnlyViewer(user, currentEnquiry, activeWorkspace, salespersons);
  const canViewConfidentialMargins =
    canManageWorkspace(user, activeWorkspace) || isAdmin(user, activeWorkspace?.id, activeWorkspace);

  const handleReleaseCreatorAccess = async () => {
    const enquiryId = currentEnquiry.id || (currentEnquiry as any)._id;
    if (!enquiryId) return;

    // DEF-19 Guard: Verify the enquiry has a valid assigned salesperson linked to a workspace member/profile before releasing creator access
    const assignedSpId = resolveSalespersonIdentifier(currentEnquiry).trim().toLowerCase();
    const assignedSpName = resolveSalespersonName(currentEnquiry).trim().toLowerCase();
    const matchedRep = (salespersons || []).find((sp) => {
      if (!sp) return false;
      const id = (sp.id || '').trim().toLowerCase();
      const uid = (sp.uid || sp.userId || sp.linked_user_id || '').trim().toLowerCase();
      const initials = (sp.initials || '').trim().toLowerCase();
      const fullName = (sp.full_name || sp.name || '').trim().toLowerCase();
      return (
        (assignedSpId && (assignedSpId === id || assignedSpId === uid || assignedSpId === initials)) ||
        (assignedSpName && (assignedSpName === fullName || assignedSpName === initials || assignedSpName === id))
      );
    });

    const hasLinkedMember = Boolean(
      matchedRep &&
        (matchedRep.uid ||
          matchedRep.userId ||
          matchedRep.linked_user_id ||
          matchedRep.email ||
          matchedRep.initials ||
          matchedRep.id) &&
        assignedSpName !== 'unassigned' &&
        assignedSpId !== 'unassigned'
    );

    if (!hasLinkedMember) {
      if (triggerToast) {
        triggerToast(
          'Cannot hand over ownership: Please assign a valid workspace Sales Representative to this enquiry first so it is not stranded.',
          'error'
        );
      }
      return;
    }

    const nowIso = new Date().toISOString();
    try {
      const patch: Partial<Enquiry> = {
        creator_access_released: true,
        creator_access_released_at: nowIso,
        updatedAt: nowIso
      };
      await safeUpdateDoc('enquiries', enquiryId, patch);
      const updatedEnquiry: Enquiry = { ...currentEnquiry, ...patch };
      await EnquiryRepository.save(updatedEnquiry).catch(() => {});
      setCurrentEnquiry(updatedEnquiry);
      if (onUpdateEnquiry) onUpdateEnquiry(updatedEnquiry);
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === enquiryId ? updatedEnquiry : e)));
      }
      if (triggerToast) {
        triggerToast('Ownership handed over to assigned representative. Creator-only access released.', 'success');
      }
      onClose();
    } catch (err: any) {
      console.error('Failed releasing creator access:', err);
      if (triggerToast) {
        triggerToast('Failed to release creator access: ' + (err?.message || 'Unknown error'), 'error');
      }
    }
  };

  const shouldShowProposalOptionBadge = (opt?: string | null) => {
    const clean = (opt || '').trim();
    if (!clean) return false;
    const lower = clean.toLowerCase();
    if (lower === 'none' || lower === 'none / single option' || lower === 'single option') return false;
    if ((lower === 'default / included' || lower === 'baseline / all') && !optionAnalysis.hasMultipleOptions) return false;
    return true;
  };

  // Resolved Assigned Salesperson display info + Inline Reassignment State
  const [isReassignRepOpen, setIsReassignRepOpen] = useState(false);
  const [isSavingRepAssignment, setIsSavingRepAssignment] = useState(false);

  const resolvedAssignedRepInfo = useMemo(() => {
    const targetEq = currentEnquiry || enquiry;
    const spId = resolveSalespersonIdentifier(targetEq);
    const spName = resolveSalespersonName(targetEq, salespersons);
    const matchedSp = (salespersons || []).find(
      (s) =>
        s &&
        ((spId &&
          (s.id === spId ||
            s.initials?.toLowerCase() === spId.toLowerCase() ||
            s.uid === spId ||
            s.userId === spId)) ||
          (spName &&
            (s.id === spName ||
              s.initials?.toLowerCase() === spName.toLowerCase() ||
              (s.full_name && s.full_name.toLowerCase() === spName.toLowerCase()) ||
              (s.name && s.name.toLowerCase() === spName.toLowerCase()))))
    );
    const fullName = matchedSp
      ? matchedSp.full_name || matchedSp.name || matchedSp.initials
      : spName || spId || '';
    const initials = matchedSp?.initials || (fullName ? fullName.slice(0, 2).toUpperCase() : '');
    const isUnassigned = !fullName || fullName.toLowerCase() === 'unassigned';
    return {
      matchedSp,
      fullName: isUnassigned ? 'Unassigned' : fullName,
      initials,
      isUnassigned
    };
  }, [currentEnquiry, enquiry, salespersons]);

  const handleQuickAssignSalesperson = async (sp: Salesperson) => {
    const enquiryId = currentEnquiry.id || (currentEnquiry as any)._id;
    if (!enquiryId || isSavingRepAssignment) return;
    setIsSavingRepAssignment(true);
    const nowIso = new Date().toISOString();
    const repFullName = sp.full_name || sp.name || sp.initials || '';
    const repInitials = sp.initials || repFullName.slice(0, 2).toUpperCase();
    const repId = sp.id || repInitials;
    try {
      const patch: Partial<Enquiry> = {
        salesperson: repFullName,
        sales_person: repInitials,
        salesperson_id: repId,
        sales_person_id: repId,
        assigned_salesperson: repFullName,
        updatedAt: nowIso
      };
      await safeUpdateDoc('enquiries', enquiryId, patch);
      const updatedEnquiry: Enquiry = { ...currentEnquiry, ...patch };
      await EnquiryRepository.save(updatedEnquiry).catch(() => {});
      setCurrentEnquiry(updatedEnquiry);
      if (onUpdateEnquiry) onUpdateEnquiry(updatedEnquiry);
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === enquiryId ? updatedEnquiry : e)));
      }
      // Also sync prepared_by onto any active Draft quotation
      const activeDrafts = quotations.filter(
        (q) =>
          !q.is_deleted &&
          (q.document_type || 'quotation') === 'quotation' &&
          String(q.status || 'Draft').toLowerCase() === 'draft'
      );
      if (activeDrafts.length > 0) {
        const updatedDrafts = await Promise.all(
          activeDrafts.map(async (dq) => {
            const patchedQuote: Quotation = {
              ...dq,
              prepared_by: repFullName,
              updated_at: nowIso
            };
            await QuotationRepository.saveQuotation(patchedQuote).catch(() => {});
            return patchedQuote;
          })
        );
        setQuotations((prev) =>
          prev.map((q) => {
            const match = updatedDrafts.find((u) => u.id === q.id);
            return match || q;
          })
        );
      }
      setIsReassignRepOpen(false);
      triggerToast?.(`Assigned salesperson updated to ${repFullName}`, 'success');
    } catch (err: any) {
      console.error('Failed to reassign salesperson:', err);
      triggerToast?.('Failed to update salesperson: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setIsSavingRepAssignment(false);
    }
  };

  // Inline Commercial Terms Quick-Edit State & Handler
  const [isEditingCommercialTerms, setIsEditingCommercialTerms] = useState(false);
  const [isSavingCommercialTerms, setIsSavingCommercialTerms] = useState(false);
  const [draftValidityDays, setDraftValidityDays] = useState<number>(30);
  const [draftPriceBasis, setDraftPriceBasis] = useState<string>('');
  const [draftDeliveryPeriod, setDraftDeliveryPeriod] = useState<string>('');
  const [draftPaymentTerms, setDraftPaymentTerms] = useState<string>('');
  const [draftTaxMode, setDraftTaxMode] = useState<'taxes_extra' | 'vat_included' | 'no_vat'>('taxes_extra');

  const activeCommercialQuote = useMemo(() => {
    const stdQuotes = unifiedHubDocuments.filter(
      (q) => (q.document_type || 'quotation') === 'quotation' && !q.is_deleted
    );
    return (
      stdQuotes.find((q) => q.status === 'Draft') ||
      stdQuotes.find((q) => q.status === 'Approved') ||
      stdQuotes.find((q) => q.status === 'Sent') ||
      stdQuotes[0]
    );
  }, [unifiedHubDocuments]);

  const effectiveCommercialTerms = useMemo(() => {
    const validity =
      Number(currentEnquiry.validity_days) > 0
        ? Number(currentEnquiry.validity_days)
        : Number(activeCommercialQuote?.validity_days) > 0
        ? Number(activeCommercialQuote?.validity_days)
        : 30;
    const priceBasis =
      (currentEnquiry.price_basis || '').trim() ||
      (activeCommercialQuote?.price_basis || '').trim() ||
      '';
    const deliveryPeriod =
      (currentEnquiry.delivery_period || '').trim() ||
      (activeCommercialQuote?.delivery_period || '').trim() ||
      '';
    const paymentTerms =
      (currentEnquiry.payment_terms || '').trim() ||
      (activeCommercialQuote?.payment_terms || '').trim() ||
      '';
    const taxMode: 'taxes_extra' | 'vat_included' | 'no_vat' =
      (currentEnquiry.tax_mode as any) ||
      (activeCommercialQuote?.tax_mode as any) ||
      'taxes_extra';
    const taxModeLabel =
      taxMode === 'no_vat'
        ? '0% / No VAT'
        : taxMode === 'vat_included'
        ? '5% VAT Included'
        : '5% Standard VAT';
    return {
      validity,
      priceBasis,
      deliveryPeriod,
      paymentTerms,
      taxMode,
      taxModeLabel
    };
  }, [currentEnquiry, activeCommercialQuote]);

  const handleOpenCommercialTermsEditor = () => {
    setDraftValidityDays(effectiveCommercialTerms.validity || 30);
    setDraftPriceBasis(effectiveCommercialTerms.priceBasis);
    setDraftDeliveryPeriod(effectiveCommercialTerms.deliveryPeriod);
    setDraftPaymentTerms(effectiveCommercialTerms.paymentTerms);
    setDraftTaxMode(effectiveCommercialTerms.taxMode);
    setIsEditingCommercialTerms(true);
  };

  const handleSaveInlineCommercialTerms = async () => {
    const enquiryId = currentEnquiry.id || (currentEnquiry as any)._id;
    if (!enquiryId || isSavingCommercialTerms) return;
    setIsSavingCommercialTerms(true);
    const nowIso = new Date().toISOString();
    const cleanValidity = Math.max(1, Number(draftValidityDays) || 30);
    const cleanPriceBasis = draftPriceBasis.trim();
    const cleanDelivery = draftDeliveryPeriod.trim();
    const cleanPayment = draftPaymentTerms.trim();
    try {
      const patch: Partial<Enquiry> = {
        validity_days: cleanValidity,
        price_basis: cleanPriceBasis || undefined,
        delivery_period: cleanDelivery || undefined,
        payment_terms: cleanPayment || undefined,
        tax_mode: draftTaxMode,
        updatedAt: nowIso
      };
      await safeUpdateDoc('enquiries', enquiryId, patch);
      const updatedEnquiry: Enquiry = { ...currentEnquiry, ...patch };
      await EnquiryRepository.save(updatedEnquiry).catch(() => {});
      setCurrentEnquiry(updatedEnquiry);
      if (onUpdateEnquiry) onUpdateEnquiry(updatedEnquiry);
      if (setEnquiries) {
        setEnquiries((prev) => prev.map((e) => (e.id === enquiryId ? updatedEnquiry : e)));
      }

      // Sync commercial terms onto any active Draft quotation for this enquiry
      const activeDrafts = quotations.filter(
        (q) =>
          !q.is_deleted &&
          (q.document_type || 'quotation') === 'quotation' &&
          String(q.status || 'Draft').toLowerCase() === 'draft'
      );
      if (activeDrafts.length > 0) {
        const updatedDrafts = await Promise.all(
          activeDrafts.map(async (dq) => {
            const calc =
              Array.isArray(dq.line_items) && dq.line_items.length > 0
                ? QuotationRepository.calculateTotals(
                    dq.line_items,
                    dq.freight_amount || 0,
                    draftTaxMode,
                    dq.tax_rate_percent ?? 5
                  )
                : null;
            const patchedQuote: Quotation = {
              ...dq,
              validity_days: cleanValidity,
              price_basis: cleanPriceBasis || dq.price_basis,
              delivery_period: cleanDelivery || dq.delivery_period,
              payment_terms: cleanPayment || dq.payment_terms,
              tax_mode: draftTaxMode,
              ...(calc
                ? {
                    subtotal: calc.subtotal,
                    tax_amount: calc.tax_amount,
                    grand_total: calc.grand_total
                  }
                : {}),
              updated_at: nowIso
            };
            await QuotationRepository.saveQuotation(patchedQuote).catch(() => {});
            return patchedQuote;
          })
        );
        setQuotations((prev) =>
          prev.map((q) => {
            const match = updatedDrafts.find((u) => u.id === q.id);
            return match || q;
          })
        );
      }

      setIsEditingCommercialTerms(false);
      triggerToast?.('Commercial terms saved & synced to active proposal!', 'success');
    } catch (err: any) {
      console.error('Failed saving commercial terms:', err);
      triggerToast?.('Failed to save commercial terms: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setIsSavingCommercialTerms(false);
    }
  };

  const renderCommercialTermsSummaryStrip = () => {
    const canEdit = canEditEnquiry(user, activeWorkspace, currentEnquiry);
    return (
      <div className="bg-slate-50/90 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Commercial Terms &amp; Offer Conditions
            </span>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() =>
                isEditingCommercialTerms
                  ? setIsEditingCommercialTerms(false)
                  : handleOpenCommercialTermsEditor()
              }
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 hover:bg-indigo-50 text-indigo-600 hover:text-indigo-700 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 transition cursor-pointer shadow-2xs"
              title="Quick-edit commercial terms directly without opening the full form"
            >
              <Edit2 className="w-3 h-3" />
              <span>{isEditingCommercialTerms ? 'Cancel' : 'Edit Terms'}</span>
            </button>
          )}
        </div>

        {!isEditingCommercialTerms ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs">
              <span className="text-[10px] font-mono uppercase text-slate-400">Validity:</span>
              <span className="font-semibold font-mono">{effectiveCommercialTerms.validity} Days</span>
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs">
              <span className="text-[10px] font-mono uppercase text-slate-400">Price Basis:</span>
              <span className="font-semibold">
                {effectiveCommercialTerms.priceBasis || <span className="text-slate-400 italic font-normal">Default / Not Set</span>}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs">
              <span className="text-[10px] font-mono uppercase text-slate-400">Delivery:</span>
              <span className="font-semibold">
                {effectiveCommercialTerms.deliveryPeriod || <span className="text-slate-400 italic font-normal">Default / Not Set</span>}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs">
              <span className="text-[10px] font-mono uppercase text-slate-400">VAT:</span>
              <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                {effectiveCommercialTerms.taxModeLabel}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs max-w-full">
              <span className="text-[10px] font-mono uppercase text-slate-400 shrink-0">Payment:</span>
              <span className="font-semibold truncate" title={effectiveCommercialTerms.paymentTerms}>
                {effectiveCommercialTerms.paymentTerms || <span className="text-slate-400 italic font-normal">Default / Not Set</span>}
              </span>
            </span>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1 font-bold">
                  Offer Validity (Days)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={draftValidityDays}
                    onChange={(e) => setDraftValidityDays(Math.max(1, Number(e.target.value) || 30))}
                    className="w-20 h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  {[15, 30, 60].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDraftValidityDays(d)}
                      className={`px-2 py-1 rounded text-[10px] font-mono font-bold border transition cursor-pointer ${
                        Number(draftValidityDays) === d
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1 font-bold">
                  Price Basis / Incoterms
                </label>
                <input
                  type="text"
                  value={draftPriceBasis}
                  onChange={(e) => setDraftPriceBasis(e.target.value)}
                  placeholder="e.g. Ex-Warehouse Ajman, DDP Site"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1 font-bold">
                  Delivery Period / Lead Time
                </label>
                <input
                  type="text"
                  value={draftDeliveryPeriod}
                  onChange={(e) => setDraftDeliveryPeriod(e.target.value)}
                  placeholder="e.g. Ex-Stock, 6-8 Weeks, 12-14 Weeks"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1 font-bold">
                  VAT / Tax Mode
                </label>
                <select
                  value={draftTaxMode}
                  onChange={(e) => setDraftTaxMode(e.target.value as any)}
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="taxes_extra">5% Standard VAT (Excl.)</option>
                  <option value="vat_included">5% VAT Included</option>
                  <option value="no_vat">No VAT (0% / Export)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1 font-bold">
                Payment Terms
              </label>
              <input
                type="text"
                value={draftPaymentTerms}
                onChange={(e) => setDraftPaymentTerms(e.target.value)}
                placeholder="e.g. 50% advance, 50% immediate upon readiness at factory"
                className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditingCommercialTerms(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingCommercialTerms}
                onClick={handleSaveInlineCommercialTerms}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingCommercialTerms ? 'Saving...' : 'Save Commercial Terms'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const formatCurrency = (val: number) => {
    if (isMaskedForBasic) return 'AED *** (Basic View)';
    const isUSD = currentEnquiry.currency === 'USD';
    const converted = isUSD ? val / 3.6725 : val;
    const symbol = isUSD ? '$' : 'AED ';
    return `${symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Dynamic Option Extraction & Aggregation (reactive to currentEnquiry.line_items)
  const optionAnalysis = React.useMemo(() => {
    const items = currentEnquiry.line_items || [];
    const groupMap: Record<string, { count: number; total: number; items: typeof items }> = {};
    let baselineTotal = 0;
    let baselineCount = 0;
    const alternativeTotals: Record<string, { count: number; total: number }> = {};
    let optionalTotal = 0;
    let optionalCount = 0;

    items.forEach((item) => {
      const rawOpt = ((item as any).option_designation || item.option || '').trim();
      const optKey = (!rawOpt || rawOpt === 'Default / Included') ? 'Default / Included' : rawOpt;
      const isDisc = item.item_type === 'discount' || (item as any).classification === 'Discount / Rebate';
      const rawPrice = Number(item.total_price !== undefined ? item.total_price : ((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))) || 0;
      const price = isDisc ? -Math.abs(rawPrice) : rawPrice;

      if (!groupMap[optKey]) {
        groupMap[optKey] = { count: 0, total: 0, items: [] };
      }
      groupMap[optKey].count += 1;
      groupMap[optKey].total += price;
      groupMap[optKey].items.push(item);

      const isOptional = optKey === 'Optional / Add-On' || optKey.toLowerCase().includes('optional') || optKey.toLowerCase().includes('add-on');
      const isBaseline = optKey === 'Default / Included' || optKey === 'Baseline / All' || optKey === 'Option A' || optKey.startsWith('Option A ');

      if (isOptional) {
        optionalTotal += price;
        optionalCount += 1;
      } else if (isBaseline) {
        baselineTotal += price;
        baselineCount += 1;
      } else {
        if (!alternativeTotals[optKey]) {
          alternativeTotals[optKey] = { count: 0, total: 0 };
        }
        alternativeTotals[optKey].count += 1;
        alternativeTotals[optKey].total += price;
      }
    });

    const detectedOptions = Object.keys(groupMap);
    const hasMultipleOptions = Object.keys(alternativeTotals).length > 0 || optionalTotal > 0 || detectedOptions.length > 1;

    return {
      groupMap,
      detectedOptions,
      baselineTotal,
      baselineCount,
      alternativeTotals,
      optionalTotal,
      optionalCount,
      hasMultipleOptions,
    };
  }, [currentEnquiry.line_items]);

  const filteredLineItems = React.useMemo(() => {
    const items = currentEnquiry.line_items || [];
    if (activeOptionTab !== 'ALL') {
      return items.filter((item) => {
        const rawOpt = ((item as any).option_designation || item.option || '').trim();
        const optKey = (!rawOpt || rawOpt === 'Default / Included') ? 'Default / Included' : rawOpt;
        return optKey === activeOptionTab;
      });
    }

    if (!optionAnalysis.hasMultipleOptions) {
      return items;
    }

    // Stable sort by option group for clean contiguous sections in 'ALL' view
    const optionPriority = (opt: string) => {
      if (opt === 'Default / Included' || opt === 'Baseline / All') return 1;
      if (opt.startsWith('Option A')) return 2;
      if (opt.startsWith('Option B')) return 3;
      if (opt.startsWith('Option C')) return 4;
      if (opt.startsWith('Option D')) return 5;
      if (opt.toLowerCase().includes('optional')) return 99;
      return 10;
    };

    return [...items].sort((a, b) => {
      const optA = ((a as any).option_designation || a.option || 'Default / Included').trim();
      const optB = ((b as any).option_designation || b.option || 'Default / Included').trim();
      return optionPriority(optA) - optionPriority(optB);
    });
  }, [currentEnquiry.line_items, activeOptionTab, optionAnalysis.hasMultipleOptions]);

  const handleRevert = async (log: AuditLog) => {
    const currentWsId = activeWorkspaceId || activeWorkspace?.id;
    if (!currentWsId) {
      alert('Critical Error: Active workspace context lost. Cannot save record.');
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }
    const userRole = getUserWorkspaceRole(user, currentWsId, activeWorkspace);
    if (user.role === 'Viewer' || userRole === 'Viewer') {
      alert('Access Denied: Viewers do not have permission to mutate proposals or revert versions.');
      return;
    }

    const performRevert = async () => {
      setReverting(true);
      try {
        // Prepare rolled-back data structure
        const targetState = log.before || log.after; // Roll back to 'before' state of the edit
        if (!targetState) {
          alert('No historic state found in this log.');
          setReverting(false);
          return;
        }

        // Clean out ID if it's there & force tamper-proof active workspace_id
        const { id, updatedAt, createdAt, ...rollbackData } = targetState;
        const finalRollbackPayload = {
          ...rollbackData,
          workspace_id: currentWsId
        };

        await safeUpdateDoc('enquiries', enquiry.id!, finalRollbackPayload);

        // Add rollback audit log
        const auditPayload = {
          document_id: enquiry.id!,
          entity_type: 'enquiry',
          action: 'update',
          changed_by_uid: user.uid,
          changed_by_name: user.username,
          timestamp: new Date().toISOString(),
          before: sanitizeAuditPayload(enquiry),
          after: sanitizeAuditPayload(rollbackData),
          changes: [
            {
              field: 'VERSION_ROLLBACK',
              old_value: `S/N ${enquiry.sn} - State from ${new Date().toLocaleDateString()}`,
              new_value: `State rolled back to ${new Date(log.timestamp).toLocaleDateString()}`
            }
          ]
        };
        await safeAddDoc('audit_logs', auditPayload);

        setRevertSuccess(true);
        setTimeout(() => {
          setRevertSuccess(false);
          window.location.reload(); // Refresh session to pull fresh data
        }, 1500);
      } catch (err: any) {
        alert('Revert failed: ' + err.message);
      } finally {
        setReverting(false);
      }
    };

    setConfirmDialog({
      isOpen: true,
      title: 'Revert Enquiry Changes',
      message: `Do you want to revert this enquiry back to the state of ${new Date(log.timestamp).toLocaleString()}?`,
      confirmText: 'Revert',
      cancelText: 'Cancel',
      isDestructive: false,
      onConfirm: performRevert
    });
  };

  const getStatusStyle = (status: string) => {
    const s = (status || '').trim().toLowerCase();
    if (s.includes('gap') || s.includes('reserved')) {
      return 'bg-amber-50 border-amber-300 text-amber-800 border-dashed';
    }
    if (s.includes('draft')) {
      return 'bg-slate-100 border-slate-300 text-slate-700';
    }
    if (s.includes('sent')) {
      return 'bg-blue-50 border-blue-200 text-blue-700';
    }
    if (s.includes('revision')) {
      return 'bg-amber-50 border-amber-200 text-amber-700';
    }
    if (s.includes('won') || s.includes('order received') || s.includes('approved')) {
      return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    }
    if (s.includes('lost') || s.includes('cancelled')) {
      return 'bg-rose-50 border-rose-200 text-rose-700';
    }
    switch (s) {
      case 'active':
        return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'hold':
        return 'bg-amber-50 border-amber-200 text-amber-700';
      case 'delayed':
        return 'bg-purple-50 border-purple-200 text-purple-700';
      case 'dead':
        return 'bg-slate-100 border-slate-200 text-slate-600';
      default:
        return 'bg-slate-50 border-slate-200 text-slate-600';
    }
  };

  return (
    <div id="enquiry-detail-drawer" className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-[90] flex justify-end">
      <div className={`w-full ${isExpandedWidth ? 'max-w-6xl xl:max-w-7xl' : 'max-w-4xl lg:max-w-5xl'} bg-white border-l border-slate-200 h-[100dvh] flex flex-col shadow-2xl relative transition-all duration-300 animate-in slide-in-from-right`}>
        
        {/* Two-Tier Sticky Header Block */}
        <div className="border-b border-slate-200/80 bg-white sticky top-0 z-20">
          {/* Tier 1: Full Client Title, Identity Badges & Window Controls (Never Crushes Title) */}
          <div className="px-4 pt-3.5 pb-2.5 sm:px-6 flex items-start justify-between gap-3 min-w-0">
            <div className="flex items-start space-x-3 min-w-0 flex-1">
              <span className="text-xs font-mono tabular-nums bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-bold shrink-0 mt-0.5">
                #{currentEnquiry.sn || enquiry.sn}
              </span>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  {(() => {
                    const resolvedCompanyName =
                      matchedCompany?.display_name ||
                      currentEnquiry.company_name ||
                      enquiry.company_name ||
                      (enquiry as any)?.company ||
                      (enquiry as any)?.client_name ||
                      'Unassigned Account';
                    return (
                      <h3
                        className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 font-sans min-w-0 max-w-full"
                        title={resolvedCompanyName}
                      >
                        <HoverScrollText text={resolvedCompanyName} />
                      </h3>
                    );
                  })()}
                  {matchedCompany && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <GoogleSearchButton
                        companyName={matchedCompany.display_name}
                        location={matchedCompany.city}
                        size="sm"
                      />
                      <TemperatureBadge
                        companyId={matchedCompany.id}
                        temperature={matchedCompany.temperature}
                        isDnc={matchedCompany.is_dnc}
                        variant="compact"
                        companies={companies}
                        setCompanies={setCompanies}
                      />
                      <IndustryBadge company={matchedCompany} size="sm" showEmpty />
                    </div>
                  )}
                  {(currentEnquiry.customer_reference_code || enquiry.customer_reference_code) && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0" title="Customer Reference Code">
                      Ref: {currentEnquiry.customer_reference_code || enquiry.customer_reference_code}
                    </span>
                  )}
                  {shouldShowProposalOptionBadge(currentEnquiry.proposal_option || enquiry.proposal_option) && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-sans font-semibold bg-purple-50 text-purple-700 border border-purple-200 shrink-0" title="Proposal Option">
                      {currentEnquiry.proposal_option || enquiry.proposal_option}
                    </span>
                  )}

                  {/* Assigned Salesperson Badge with Quick Inline Reassignment */}
                  <div className="relative inline-flex items-center shrink-0">
                    <button
                      type="button"
                      disabled={!canEditEnquiry(user, activeWorkspace, currentEnquiry)}
                      onClick={() => {
                        if (canEditEnquiry(user, activeWorkspace, currentEnquiry)) {
                          setIsReassignRepOpen((prev) => !prev);
                        }
                      }}
                      title={
                        canEditEnquiry(user, activeWorkspace, currentEnquiry)
                          ? `Assigned Sales Representative: ${resolvedAssignedRepInfo.fullName} (Click to reassign)`
                          : `Assigned Sales Representative: ${resolvedAssignedRepInfo.fullName}`
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-sans font-bold border transition shadow-2xs ${
                        resolvedAssignedRepInfo.isUnassigned
                          ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                      } ${canEditEnquiry(user, activeWorkspace, currentEnquiry) ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <User className="w-3 h-3 text-blue-600 shrink-0" />
                      <span>
                        Assigned: {resolvedAssignedRepInfo.fullName}
                        {resolvedAssignedRepInfo.initials &&
                        resolvedAssignedRepInfo.initials.toLowerCase() !==
                          resolvedAssignedRepInfo.fullName.toLowerCase()
                          ? ` (${resolvedAssignedRepInfo.initials})`
                          : ''}
                      </span>
                      {canEditEnquiry(user, activeWorkspace, currentEnquiry) && (
                        <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
                      )}
                    </button>

                    {isReassignRepOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setIsReassignRepOpen(false)}
                        />
                        <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-40 max-h-64 overflow-y-auto">
                          <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                            Assign Sales Representative
                          </div>
                          {(salespersons || []).length > 0 ? (
                            (salespersons || []).map((sp) => {
                              const spLabel = sp.full_name || sp.name || sp.initials || 'Rep';
                              const isCurrent =
                                resolvedAssignedRepInfo.matchedSp?.id === sp.id ||
                                resolvedAssignedRepInfo.fullName.toLowerCase() === spLabel.toLowerCase();
                              return (
                                <button
                                  key={sp.id || sp.initials || spLabel}
                                  type="button"
                                  disabled={isSavingRepAssignment}
                                  onClick={() => handleQuickAssignSalesperson(sp)}
                                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                                    isCurrent
                                      ? 'bg-blue-50/80 text-blue-800 font-bold'
                                      : 'text-slate-700 hover:bg-slate-50 font-medium'
                                  }`}
                                >
                                  <span className="flex items-center gap-2 truncate">
                                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                                      {sp.initials || spLabel.slice(0, 2).toUpperCase()}
                                    </span>
                                    <span className="truncate">{spLabel}</span>
                                  </span>
                                  {isCurrent && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-3 py-2 text-xs text-slate-400 italic">
                              No sales representatives configured in workspace.
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {isCreatorOnly && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-sans font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0" title="Visible to you because you logged this enquiry on behalf of the assigned salesperson">
                      Logged by You
                    </span>
                  )}
                </div>
                {(currentEnquiry.subject || enquiry.subject) && (
                  <div className="text-xs text-slate-500 font-medium mt-0.5 min-w-0">
                    <HoverScrollText text={currentEnquiry.subject || enquiry.subject || ''} />
                  </div>
                )}
              </div>
            </div>

            {/* Pinned Window Controls: Expand/Compress & Close */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsExpandedWidth(!isExpandedWidth)}
                className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition shrink-0 cursor-pointer"
                title={isExpandedWidth ? 'Compress drawer width' : 'Expand full width'}
              >
                {isExpandedWidth ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-800 rounded-lg transition shrink-0 cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </div>

          {/* Tier 2: Dedicated Action Toolbar Row (3 Primary Actions + More Actions Menu) */}
          <div className="px-4 py-2 sm:px-6 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {/* 1. Primary Studio Button: [ Document Studio ] with count badge */}
              <button
                type="button"
                onClick={() => {
                  setEditingQuotation(resolvePrimarySavedQuotation());
                  setIsQuotationStudioOpen(true);
                }}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs transition cursor-pointer whitespace-nowrap shrink-0"
                title="Open Document Studio to generate or customize Quotations, Delivery Notes, POs, Receipts & Vouchers"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Document Studio</span>
                <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-mono font-bold leading-none">
                  {unifiedHubDocuments.length || quotations.length || 1}
                </span>
              </button>

              {/* 2. Primary Edit Button: [ Edit Form ] */}
              {canEditEnquiry(user, activeWorkspace, enquiry) && (
                <button
                  type="button"
                  onClick={() => {
                    onEditEnquiry(currentEnquiry);
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition shrink-0 cursor-pointer whitespace-nowrap"
                  title="Open full Edit Enquiry Modal"
                >
                  <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Edit Form</span>
                </button>
              )}

              {/* 3. Primary Revision Button: [ Create Revision ] */}
              {canEditEnquiry(user, activeWorkspace, enquiry) && (
                <button
                  type="button"
                  onClick={handleCreateRevision}
                  className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-2xs transition cursor-pointer whitespace-nowrap shrink-0"
                  title="Create next Proposal Revision (-R2, -R3) on this same Enquiry S/N and log in Commercial Documents Hub"
                >
                  <GitFork className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Create Revision</span>
                </button>
              )}
            </div>

            {/* Secondary Actions Dropdown: [ ··· More Actions ] */}
            <div className="relative flex items-center shrink-0">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isMoreActionsOpen}
                onClick={() => setIsMoreActionsOpen((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shadow-2xs ${
                  isMoreActionsOpen
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700'
                }`}
                title="More Enquiry Actions"
              >
                <MoreHorizontal className="w-4 h-4" />
                <span>More Actions</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMoreActionsOpen ? 'rotate-180' : ''}`} />
              </button>

              {isMoreActionsOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsMoreActionsOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-white text-slate-800 border border-slate-200 shadow-xl py-1.5 z-40 divide-y divide-slate-100"
                  >
                    <div className="py-1">
                      {canEditEnquiry(user, activeWorkspace, enquiry) && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsMoreActionsOpen(false);
                            handleDuplicateAsNewEnquiry();
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                          <span>Duplicate as New Enquiry</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          setIsMoreActionsOpen(false);
                          handleInitiate({
                            companyId: matchedCompany?.id || enquiry.company_id,
                            companyName: matchedCompany?.display_name,
                            company: matchedCompany,
                            contactId: matchedContact?.id || enquiry.contact_id,
                            contactName: matchedContact?.full_name,
                            contact: matchedContact,
                            enquiryId: enquiry.id || enquiry.quote_ref_no || String(enquiry.sn),
                            e
                          });
                        }}
                        className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 cursor-pointer transition"
                      >
                        <Phone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Log Activity</span>
                      </button>

                      {canEditEnquiry(user, activeWorkspace, enquiry) && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsMoreActionsOpen(false);
                            setActiveTab('items');
                            setIsInlineEditingItems(true);
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <ListOrdered className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>Manage Line Items</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setIsMoreActionsOpen(false);
                          setIsShareModalOpen(true);
                        }}
                        className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-between gap-2 cursor-pointer transition"
                      >
                        <span className="flex items-center gap-2.5">
                          <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>Share Link &amp; Collaborators</span>
                        </span>
                        {totalCollaboratorsCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-mono font-bold leading-none">
                            {totalCollaboratorsCount}
                          </span>
                        )}
                      </button>
                    </div>

                    {canDeleteEnquiry(user, activeWorkspace, enquiry) && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            setIsMoreActionsOpen(false);
                            const targetId = enquiry.id || (enquiry as any)._id;
                            if (!targetId) {
                              alert('Error: Enquiry ID is missing. Cannot delete.');
                              return;
                            }

                            const linkedProjId = enquiry.project_id || linkedProject?.id;
                            if (linkedProjId) {
                              let activeProj = linkedProject;
                              if (!activeProj && enquiry.id) {
                                try {
                                  activeProj = await getProjectForEnquiry(enquiry.id);
                                } catch (e) {
                                  console.warn('Failed to fetch project for deletion guard:', e);
                                }
                              }
                              if (activeProj && activeProj.status !== 'Cancelled') {
                                const guardMsg =
                                  'Cannot delete this proposal because an active project is linked. Please cancel the operational project before deleting this enquiry.';
                                if (triggerToast) {
                                  triggerToast(guardMsg, 'error');
                                } else {
                                  alert(guardMsg);
                                }
                                return;
                              }
                            }

                            setConfirmDialog({
                              isOpen: true,
                              title: 'Move to Recycle Bin',
                              message: `Are you sure you want to move Enquiry #${enquiry.sn} to the Recycle Bin? You can restore it anytime from the sidebar.`,
                              confirmText: 'Move to Bin',
                              cancelText: 'Cancel',
                              variant: 'warning',
                              isDestructive: false,
                              onConfirm: () => {
                                onDeleteEnquiry(targetId);
                                onClose();
                              }
                            });
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>Delete Enquiry</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tab Selection with Live Counts */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex space-x-6 text-sm overflow-x-auto scrollbar-none shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs z-20 relative">
          {([
            { id: 'details', label: 'Details', count: null },
            { id: 'items', label: 'Line Items', count: (currentEnquiry.line_items || []).length },
            { id: 'revisions', label: 'Commercial Documents', count: unifiedHubDocuments.length },
            { id: 'history', label: 'History', count: recordLogs.length }
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`py-3.5 font-semibold font-sans relative flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === t.id ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>{t.label}</span>
              {t.count !== null && t.count > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums font-bold ${
                    activeTab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {t.count}
                </span>
              )}
              {activeTab === t.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto p-6 pb-16 space-y-6">
          
          {revertSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 flex items-center space-x-3 font-sans text-sm animate-pulse">
              <Check className="w-5 h-5 shrink-0 text-emerald-600" />
              <span>Record rolled back successfully! Resetting session...</span>
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Status and Value Header Card */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${getStatusStyle(currentEnquiry.status)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">Status</span>
                    {canEditEnquiry(user, activeWorkspace, currentEnquiry) && (
                      <select
                        value={normalizeEnquiryStatus(currentEnquiry.status)}
                        disabled={isUpdatingStatus}
                        onChange={(e) => handleStatusTransition(e.target.value)}
                        className="text-xs bg-white/90 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-0.5 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer focus:outline-none shadow-2xs"
                        title="Change Enquiry Status"
                      >
                        {PIPELINE_STATUS_GROUPS.map((group) => (
                          <optgroup
                            key={group.label}
                            label={group.label}
                            className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]"
                          >
                            {group.options.map((st) => (
                              <option
                                key={st}
                                value={st}
                                className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 normal-case font-sans text-xs font-normal"
                              >
                                {st}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        {/* Fallback for any legacy or custom status not in canonical groups */}
                        {currentEnquiry.status && !PIPELINE_STATUS_GROUPS.some((g) => (g.options as readonly string[]).includes(normalizeEnquiryStatus(currentEnquiry.status))) && (
                          <optgroup label="Other / Legacy" className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                            <option value={currentEnquiry.status} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 normal-case font-sans text-xs">
                              {currentEnquiry.status}
                            </option>
                          </optgroup>
                        )}
                      </select>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="text-base font-bold font-sans">{currentEnquiry.status}</span>
                    {currentEnquiry.stock_reserved && (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <Boxes className="w-3 h-3" />
                        <span>Stock Reserved</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
                  {(() => {
                    const stdQuotes = unifiedHubDocuments.filter(
                      (q) => (q.document_type || 'quotation') === 'quotation' && !q.is_deleted
                    );
                    const activeQ =
                      stdQuotes.find((q) => q.status === 'Approved') ||
                      stdQuotes.find((q) => q.status === 'Sent') ||
                      stdQuotes[0];
                    const hasLineItems = (currentEnquiry.line_items || []).length > 0;
                    const isUSD = currentEnquiry.currency === 'USD';
                    const effectiveTaxMode = activeQ?.tax_mode || currentEnquiry.tax_mode || 'taxes_extra';
                    const isNoVat = effectiveTaxMode === 'no_vat';
                    const subtotalAed = activeQ
                      ? (activeQ.currency === 'USD' ? Number(activeQ.subtotal || 0) * 3.6725 : Number(activeQ.subtotal || 0))
                      : hasLineItems && !currentEnquiry.is_lump_sum
                      ? (isUSD ? optionAnalysis.baselineTotal * 3.6725 : optionAnalysis.baselineTotal)
                      : Number(currentEnquiry.value_aed || 0);
                    const vatAed = isNoVat
                      ? 0
                      : activeQ && activeQ.tax_amount !== undefined && effectiveTaxMode !== 'taxes_extra'
                      ? (activeQ.currency === 'USD' ? Number(activeQ.tax_amount || 0) * 3.6725 : Number(activeQ.tax_amount || 0))
                      : Math.round(subtotalAed * 0.05 * 100) / 100;
                    const grandTotalAed = isNoVat ? subtotalAed : subtotalAed + vatAed;

                    return (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                            Package Value
                          </span>
                          {shouldShowProposalOptionBadge(currentEnquiry.proposal_option || enquiry.proposal_option) && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200" title="Selected Option">
                              {currentEnquiry.proposal_option || enquiry.proposal_option}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-col gap-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[10px] font-mono text-slate-500">Subtotal (Excl. VAT)</span>
                            <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                              {formatCurrency(subtotalAed)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-slate-200/70">
                            <span className="text-[10px] font-mono text-slate-500">
                              {isNoVat
                                ? 'Grand Total (VAT Excluded / 0% VAT)'
                                : `Grand Total (Incl. 5% VAT: ${formatCurrency(vatAed)})`}
                            </span>
                            <span className="text-xs font-bold font-mono tabular-nums text-blue-600">
                              {formatCurrency(grandTotalAed)}
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Compact Commercial Terms Summary & Quick-Edit Strip */}
              {renderCommercialTermsSummaryStrip()}

              {/* Won Status - Project Conversion / Fulfillment Banner */}
              {isWonStatus(currentEnquiry.status) && (
                <div className="p-4.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-gradient-to-r from-emerald-50/80 via-emerald-50/40 to-blue-50/40 dark:from-emerald-950/40 dark:via-slate-900 dark:to-blue-950/30 space-y-3 shadow-xs">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="p-1.5 rounded-lg bg-emerald-600 text-white shadow-2xs">
                          <PackageCheck className="w-4 h-4" />
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white font-sans">
                          {linkedProject || currentEnquiry.project_number
                            ? `Project Linked: ${linkedProject?.project_number || currentEnquiry.project_number}`
                            : 'Enquiry Won — Ready for Project Fulfillment'}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-sans">
                        {linkedProject || currentEnquiry.project_number
                          ? `This enquiry has been converted into project ${linkedProject?.project_number || currentEnquiry.project_number} (${linkedProject?.status || 'In Progress'}). Contract value: ${formatCurrency(currentEnquiry.value_aed)}.`
                          : 'Warehouse inventory has been reserved. You can now instantiate an operational project container to track procurement, delivery, and installation.'}
                      </p>
                    </div>

                    {!linkedProject && !currentEnquiry.project_number ? (
                      <button
                        type="button"
                        id="create-project-fulfillment-btn"
                        disabled={isCreatingProject}
                        onClick={handleOpenConvertModal}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center space-x-2 shrink-0 cursor-pointer disabled:opacity-60"
                      >
                        {isCreatingProject ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Creating Project...</span>
                          </>
                        ) : (
                          <>
                            <FolderPlus className="w-4 h-4" />
                            <span>Convert to Project / Fulfillment</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const targetId = linkedProject?.id || currentEnquiry.project_id || linkedProject?.project_number || currentEnquiry.project_number;
                            if (targetId && onNavigateToProject) {
                              onNavigateToProject(targetId);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 shadow-2xs transition flex items-center space-x-1.5 cursor-pointer"
                          title="Open linked project in Operations"
                        >
                          <span>{linkedProject?.project_number || currentEnquiry.project_number}</span>
                          <ExternalLink className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Stock reservation breakdown info */}
                  {(() => {
                    const linkedCount = currentEnquiry.line_items?.filter((it) => Boolean(it.product_id)).length || 0;
                    return (
                      <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                        <div className="flex items-center space-x-2">
                          <Boxes className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>
                            {currentEnquiry.stock_reserved
                              ? `Auto-reserved ${linkedCount} catalog product line(s) in warehouse`
                              : linkedCount > 0
                                ? `${linkedCount} catalog product(s) linked (Physical stock deducted on dispatch)`
                                : 'No catalog products linked for warehouse reservation'}
                          </span>
                        </div>
                        {currentEnquiry.stock_reserved_at && (
                          <span className="font-mono text-[10px] text-slate-400">
                            Reserved on {new Date(currentEnquiry.stock_reserved_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Unified Commercial Documents Hub */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-mono text-slate-700 uppercase tracking-widest font-bold">
                      Commercial Documents Hub ({unifiedHubDocuments.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleIssueDeliveryNote()}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold flex items-center gap-1 cursor-pointer transition shadow-2xs"
                      title="Generate an unpriced Delivery Note (DO) from the active quotation or line items"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>Issue DO</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenSupplierPoModal()}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold flex items-center gap-1 cursor-pointer transition shadow-2xs"
                      title="Generate an Outbound Supplier PO (using cost prices) or Order Acknowledgment"
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>Issue PO</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleIssuePaymentReceipt()}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center gap-1 cursor-pointer transition shadow-2xs"
                      title="Generate a Payment Receipt Voucher (REC) with automatic balance tracking"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Issue Receipt</span>
                    </button>
                  </div>
                </div>

                {/* Procurement Cost & Realized Net Margin Rollup Strip (Gated to Workspace Admins/Managers - DEF-17) */}
                {canViewConfidentialMargins &&
                  (enquiryProcurementRollup.linkedPos.length > 0 ||
                    enquiryProcurementRollup.linkedBills.length > 0) && (
                  <div className="p-3 rounded-xl bg-white border border-indigo-200/80 shadow-2xs grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                        Supplier POs ({enquiryProcurementRollup.linkedPos.length})
                      </span>
                      <span className="font-mono font-bold text-indigo-700">
                        AED{' '}
                        {enquiryProcurementRollup.poCommittedTotalAed.toLocaleString('en-US', {
                          minimumFractionDigits: 2
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                        Bills ({enquiryProcurementRollup.linkedBills.length}) / Actual Cost
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        AED{' '}
                        {enquiryProcurementRollup.netActualProcurementCostAed.toLocaleString(
                          'en-US',
                          { minimumFractionDigits: 2 }
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                        Debit Note Credits
                      </span>
                      <span className="font-mono font-bold text-purple-700">
                        AED{' '}
                        {enquiryProcurementRollup.debitNoteCreditsAed.toLocaleString('en-US', {
                          minimumFractionDigits: 2
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                        Paid Out (PVs)
                      </span>
                      <span className="font-mono font-bold text-amber-700">
                        AED{' '}
                        {enquiryProcurementRollup.totalPaidOutAed.toLocaleString('en-US', {
                          minimumFractionDigits: 2
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                        Realized Net Margin
                      </span>
                      <span
                        className={`font-mono font-extrabold ${
                          enquiryProcurementRollup.realizedNetMarginAed >= 0
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        AED{' '}
                        {enquiryProcurementRollup.realizedNetMarginAed.toLocaleString('en-US', {
                          minimumFractionDigits: 2
                        })}{' '}
                        ({enquiryProcurementRollup.realizedNetMarginPct}%)
                      </span>
                    </div>
                  </div>
                )}

                {/* Document Type Filter Bar */}
                {unifiedHubDocuments.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                    {(
                      [
                        { id: 'all' as const, label: `All (${unifiedHubDocuments.length})` },
                        {
                          id: 'quotation' as const,
                          label: `Proposals & Revisions (${unifiedHubDocuments.filter((q) => (q.document_type || 'quotation') === 'quotation').length})`
                        },
                        {
                          id: 'delivery_note' as const,
                          label: `Delivery Notes (${unifiedHubDocuments.filter((q) => q.document_type === 'delivery_note').length})`
                        },
                        {
                          id: 'purchase_order' as const,
                          label: `Purchase Orders (${unifiedHubDocuments.filter((q) => q.document_type === 'purchase_order').length})`
                        },
                        {
                          id: 'receipt' as const,
                          label: `Receipts (${unifiedHubDocuments.filter((q) => q.document_type === 'receipt').length})`
                        },
                        ...(unifiedHubDocuments.some((q) => q.document_type === 'payment_voucher')
                          ? [
                              {
                                id: 'payment_voucher' as const,
                                label: `Payment Vouchers (${unifiedHubDocuments.filter((q) => q.document_type === 'payment_voucher').length})`
                              }
                            ]
                          : []),
                        ...(unifiedHubDocuments.some(
                          (q) =>
                            q.document_type === 'material_return_note' ||
                            q.document_type === 'debit_note'
                        )
                          ? [
                              {
                                id: 'material_return_note' as const,
                                label: `Returns (${unifiedHubDocuments.filter((q) => q.document_type === 'material_return_note').length})`
                              },
                              {
                                id: 'debit_note' as const,
                                label: `Debit Notes (${unifiedHubDocuments.filter((q) => q.document_type === 'debit_note').length})`
                              }
                            ]
                          : [])
                      ]
                    ).map((f) => {
                      const isSel = docHubFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setDocHubFilter(f.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                            isSel
                              ? 'bg-slate-800 text-white shadow-2xs'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Unified Commercial Documents Hub Table */}
                {filteredHubDocuments.length > 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-3 font-bold">Type</th>
                            <th className="py-2.5 px-3 font-bold">Reference Code</th>
                            <th className="py-2.5 px-3 font-bold">Rev #</th>
                            <th className="py-2.5 px-3 font-bold">Created Date</th>
                            <th className="py-2.5 px-3 font-bold text-right">Total Amount</th>
                            <th className="py-2.5 px-3 font-bold">Status</th>
                            <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredHubDocuments.map((q) => {
                            const docType = q.document_type || 'quotation';
                            const isQuoteDoc = docType === 'quotation';
                            const isBaselineVirtual = Boolean((q as any)._isBaselineEnquiryProposal);
                            const linkedEnqId = (q as any)._linkedEnquiryId as string | undefined;
                            const isSuperseded = q.status === 'Superseded';
                            const isApproved = q.status === 'Approved';
                            const isDeclined = q.status === 'Declined';
                            const isSent = q.status === 'Sent';
                            const isDraft = q.status === 'Draft' || !q.status;

                            const badgeLabel =
                              docType === 'delivery_note'
                                ? 'DO'
                                : docType === 'purchase_order'
                                ? 'PO'
                                : docType === 'receipt'
                                ? 'REC'
                                : docType === 'payment_voucher'
                                ? 'PV'
                                : docType === 'material_return_note'
                                ? 'MRN'
                                : docType === 'debit_note'
                                ? 'DN'
                                : 'QT';

                            const badgeClass =
                              docType === 'delivery_note'
                                ? 'bg-blue-100 text-blue-800 border-blue-200'
                                : docType === 'purchase_order'
                                ? 'bg-purple-100 text-purple-800 border-purple-200'
                                : docType === 'receipt'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : docType === 'payment_voucher'
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : docType === 'material_return_note' || docType === 'debit_note'
                                ? 'bg-rose-100 text-rose-800 border-rose-200'
                                : 'bg-indigo-100 text-indigo-800 border-indigo-200';

                            const formattedDate = q.created_at
                              ? new Date(q.created_at).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric'
                                })
                              : '—';

                            return (
                              <tr
                                key={q.id || q.formatted_quote_ref}
                                className={`transition hover:bg-slate-50/90 ${
                                  isApproved && isQuoteDoc
                                    ? 'bg-emerald-50/40'
                                    : isDeclined
                                    ? 'bg-rose-50/30 opacity-85'
                                    : isSuperseded
                                    ? 'bg-slate-50/60 text-slate-500 opacity-80'
                                    : ''
                                }`}
                              >
                                {/* 1. Document Type Badge */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${badgeClass}`}
                                  >
                                    {badgeLabel}
                                  </span>
                                </td>

                                {/* 2. Reference Code */}
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono font-bold text-slate-900">
                                      {q.formatted_quote_ref}
                                    </span>
                                    {isBaselineVirtual && (
                                      <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                        Baseline Proposal
                                      </span>
                                    )}
                                  </div>
                                  {docType === 'purchase_order' && q.purchase_order_metadata?.supplier_name && (
                                    <span className="text-[10px] text-slate-400 block">
                                      Vendor: {q.purchase_order_metadata.supplier_name}
                                    </span>
                                  )}
                                  {docType === 'delivery_note' && q.delivery_metadata?.dispatch_mode && (
                                    <span className="text-[10px] text-slate-400 block">
                                      Dispatch: {q.delivery_metadata.dispatch_mode}
                                    </span>
                                  )}
                                </td>

                                {/* 3. Revision # */}
                                <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                                  {isQuoteDoc ? (
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10.5px] font-bold">
                                      R{q.revision_number || 1}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>

                                {/* 4. Created Date */}
                                <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600">
                                  {formattedDate}
                                </td>

                                {/* 5. Total Amount */}
                                <td className="py-2.5 px-3 whitespace-nowrap text-right font-mono">
                                  {docType === 'delivery_note' || docType === 'material_return_note' ? (
                                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                      Unpriced • {(q.line_items || []).length} item(s)
                                    </span>
                                  ) : docType === 'receipt' ? (
                                    <span className="font-bold text-emerald-800">
                                      {q.currency || 'AED'}{' '}
                                      {Number(
                                        q.receipt_metadata?.amount_received ?? q.grand_total ?? 0
                                      ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                  ) : (
                                    <span className="font-bold text-slate-900">
                                      {isMaskedForBasic
                                        ? 'AED ***'
                                        : `${q.currency || 'AED'} ${Number(q.grand_total || 0).toLocaleString(
                                            'en-US',
                                            { minimumFractionDigits: 2 }
                                          )}`}
                                    </span>
                                  )}
                                </td>

                                {/* 6. Status */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {isApproved && isQuoteDoc ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-emerald-100 text-emerald-800 border-emerald-300">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      Approved
                                    </span>
                                  ) : isDeclined ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-200">
                                      <XCircle className="w-3 h-3 text-rose-600" />
                                      Declined
                                    </span>
                                  ) : (
                                    <span
                                      className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                        isSent
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : isSuperseded
                                          ? 'bg-slate-100 text-slate-500 border-slate-200'
                                          : 'bg-amber-50 text-amber-700 border-amber-200'
                                      }`}
                                    >
                                      {q.status || 'Draft'}
                                    </span>
                                  )}
                                </td>

                                {/* 7. Actions: Direct Open in Studio & Print + Lifecycle */}
                                <td className="py-2.5 px-3 whitespace-nowrap text-right">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    {linkedEnqId && linkedEnqId !== currentEnquiry.id && onSelectEnquiry ? (
                                      <button
                                        type="button"
                                        onClick={() => onSelectEnquiry(linkedEnqId)}
                                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-semibold rounded-lg transition cursor-pointer"
                                      >
                                        Switch Sheet
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingQuotation(isBaselineVirtual ? resolvePrimarySavedQuotation() : q);
                                          setIsQuotationStudioOpen(true);
                                        }}
                                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-semibold rounded-lg transition cursor-pointer flex items-center gap-1"
                                        title="Open in Quotation Studio"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                        <span>Open in Studio</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleOutsideQuickPrint(q);
                                      }}
                                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold rounded-lg transition cursor-pointer flex items-center gap-1"
                                      title="Print or Save as PDF"
                                    >
                                      <Printer className="w-3 h-3 text-slate-500" />
                                      <span>Print</span>
                                    </button>

                                    {!isBaselineVirtual && isQuoteDoc && !isSuperseded && !isDeclined && (
                                      <button
                                        type="button"
                                        onClick={() => handleCreateQuotationRevision(q)}
                                        className="px-2 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold rounded-lg transition cursor-pointer flex items-center gap-1"
                                        title={`Fork Revision R${(q.revision_number || 1) + 1}`}
                                      >
                                        <GitFork className="w-3 h-3" />
                                        <span>+Rev</span>
                                      </button>
                                    )}

                                    {!isBaselineVirtual && isQuoteDoc && isSent && !isSuperseded && !isDeclined && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => promptAcceptQuotation(q)}
                                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition cursor-pointer"
                                          title="Accept Commercial Offer & Win Enquiry"
                                        >
                                          Accept
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => openDeclineModal(q)}
                                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold rounded-lg transition cursor-pointer"
                                          title="Mark Quotation as Declined"
                                        >
                                          Decline
                                        </button>
                                      </>
                                    )}

                                    {!isBaselineVirtual && (
                                      <button
                                        type="button"
                                        onClick={() => promptDeleteQuotation(q)}
                                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                        title={isDraft ? 'Discard Draft Document' : 'Move Document to Recycle Bin'}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-white border border-dashed border-slate-200 rounded-xl text-center space-y-1.5">
                    <p className="text-xs text-slate-500">
                      No commercial documents matching this filter yet.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingQuotation(resolvePrimarySavedQuotation());
                        setIsQuotationStudioOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Open Quotation Studio</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Company switchboard metadata */}
              {matchedCompany ? (
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest flex items-center space-x-2">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        <span>Client Account</span>
                      </h4>
                      <GoogleSearchButton
                        companyName={matchedCompany.display_name}
                        location={matchedCompany.city}
                        size="xs"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => openEditCompany(matchedCompany)}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                        title="Edit Company Details"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit Company</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPairCompanyDropdownOpen(!isPairCompanyDropdownOpen)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                        title="Re-pair with another company account"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>Re-pair</span>
                      </button>
                      <TemperatureBadge
                        companyId={matchedCompany.id}
                        temperature={matchedCompany.temperature}
                        isDnc={matchedCompany.is_dnc}
                        variant="pill"
                        companies={companies}
                        setCompanies={setCompanies}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                    <div className="flex items-center space-x-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{matchedCompany.city}, {matchedCompany.country}</span>
                    </div>
                    {matchedCompany.general_email && (
                      <div className="flex items-center space-x-2 text-slate-700 overflow-hidden">
                        <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">{matchedCompany.general_email}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50/70 border border-amber-200 p-5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-xs font-mono text-amber-800 uppercase tracking-widest flex items-center space-x-2 font-bold">
                        <Building className="w-3.5 h-3.5 text-amber-600" />
                        <span>Unpaired Company Account</span>
                      </h4>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setIsCreateCompanyModalOpen(true)}
                        className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 transition"
                        title="Create new catalog account and pair"
                      >
                        <Building className="w-3 h-3" />
                        <span>Create & Link</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPairCompanyDropdownOpen(!isPairCompanyDropdownOpen)}
                        className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200/70 border border-amber-300 transition"
                        title="Search and pair existing company"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>Pair Existing</span>
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-700 space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-400 font-medium">Record Account:</span>
                      <span className="font-bold text-slate-900 font-sans">
                        {unpairedCompanyName || 'Unassigned Account'}
                      </span>
                    </div>

                    {/* Candidate / Duplicate recommendation card */}
                    {candidateCompanyMatch && candidateCompanyMatch.match && (
                      <div className="p-3 bg-white rounded-lg border border-amber-300 flex items-center justify-between gap-3 shadow-2xs">
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-mono">
                              {Math.round(candidateCompanyMatch.similarity * 100)}% Match
                            </span>
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {candidateCompanyMatch.match.display_name || candidateCompanyMatch.match.canonical_name}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {candidateCompanyMatch.match.city || 'UAE'} • {candidateCompanyMatch.reason}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePairCompany(candidateCompanyMatch.match)}
                          className="shrink-0 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <Check className="w-3 h-3" />
                          <span>Pair This Account</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Inline Search & Pair Dropdown Popover */}
              {isPairCompanyDropdownOpen && (
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-lg space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Select Company Account to Pair
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPairCompanyDropdownOpen(false)}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search company by name or city..."
                      value={companySearchTerm}
                      onChange={(e) => setCompanySearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {companies
                      .filter((c) => {
                        if (!companySearchTerm.trim()) return true;
                        const term = companySearchTerm.toLowerCase();
                        return (
                          c.display_name?.toLowerCase().includes(term) ||
                          c.canonical_name?.toLowerCase().includes(term) ||
                          c.city?.toLowerCase().includes(term)
                        );
                      })
                      .slice(0, 10)
                      .map((c) => (
                        <div
                          key={c.id}
                          onClick={() => handlePairCompany(c)}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-100 cursor-pointer text-xs transition"
                        >
                          <div className="font-semibold text-slate-900 truncate">
                            {c.display_name || c.canonical_name}
                          </div>
                          <div className="text-[11px] text-slate-400 shrink-0 ml-2">
                            {c.city || c.country || ''}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Contact Information & Concerned Stakeholders */}
              {(matchedContact || resolvedConcernedPersons.length > 0) && (
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest flex items-center space-x-2">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{matchedContact ? 'Contact Person' : 'Concerned Stakeholders'}</span>
                    </h4>
                    {matchedContact && (
                      <button
                        type="button"
                        onClick={() => openEditContact(matchedCompany?.id, matchedContact)}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                        title="Edit Contact Person"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit Contact</span>
                      </button>
                    )}
                  </div>
                  {matchedContact && (
                    <>
                      <div className="space-y-1">
                        <span className="text-sm font-semibold text-slate-800 block font-sans">{matchedContact.full_name}</span>
                        <span className="text-[10px] text-slate-500 block font-sans">{matchedContact.designation || 'Project Manager'}</span>
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center gap-4 text-xs font-sans text-slate-600 border-t border-slate-200 pt-2.5">
                        {matchedContact.mobile && (
                          <div className="flex items-center space-x-2">
                            <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                            <a
                              href={`tel:${matchedContact.mobile}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:underline font-mono"
                            >
                              {matchedContact.mobile}
                            </a>
                            <a
                              href={getWhatsAppUrl(matchedContact.mobile)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold transition cursor-pointer"
                              title={`WhatsApp ${matchedContact.full_name}`}
                            >
                              <MessageSquare className="w-3 h-3 text-emerald-600" />
                              <span>WhatsApp</span>
                            </a>
                          </div>
                        )}
                        {matchedContact.email && (
                          <div className="flex items-center space-x-2 overflow-hidden">
                            <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="truncate">{matchedContact.email}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {resolvedConcernedPersons.length > 0 && (
                    <div className={`${matchedContact ? 'border-t border-slate-200 pt-3' : ''} space-y-2`}>
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center space-x-1.5">
                        <Users className="w-3 h-3 text-slate-400" />
                        <span>Stakeholders / Concerned Persons</span>
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {resolvedConcernedPersons.map((person, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50/80 text-blue-700 border border-blue-200/60 font-sans"
                          >
                            {person}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Engagement details / Identifiers & Dates */}
              <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-4 sm:p-4.5 rounded-xl space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>Enquiry Details</span>
                  </h4>
                  {shouldShowProposalOptionBadge(currentEnquiry.proposal_option || enquiry.proposal_option) && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800" title="Proposal Option">
                      {currentEnquiry.proposal_option || enquiry.proposal_option}
                    </span>
                  )}
                </div>

                {/* Core Identifiers & Attribution Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block uppercase font-mono text-[10px]">Quote Ref</span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold font-mono truncate block" title={QuotationRepository.sanitizeCanonicalQuoteRef(currentEnquiry.quote_ref_no || enquiry.quote_ref_no)}>
                      {QuotationRepository.sanitizeCanonicalQuoteRef(currentEnquiry.quote_ref_no || enquiry.quote_ref_no) || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block uppercase font-mono text-[10px]">Sales Representative</span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold font-sans truncate block">
                      {(() => {
                        const targetEq = currentEnquiry || enquiry;
                        const spId = resolveSalespersonIdentifier(targetEq);
                        const spName = resolveSalespersonName(targetEq);
                        const sp = salespersons.find(
                          (s) =>
                            s &&
                            ((spId && (s.id === spId || s.initials === spId)) ||
                             (spName &&
                               (s.id === spName ||
                                s.initials === spName ||
                                (s.full_name && s.full_name.toLowerCase() === spName.toLowerCase()) ||
                                (s.name && s.name.toLowerCase() === spName.toLowerCase()))))
                        );
                        return sp ? (sp.full_name || sp.name || sp.initials) : (spName || spId || '—');
                      })()}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block uppercase font-mono text-[10px]">Project Country</span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold font-sans truncate block">{enquiry.country || '—'}</span>
                  </div>

                  {(currentEnquiry.customer_reference_code || enquiry.customer_reference_code) && (
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 block uppercase font-mono text-[10px]">Customer Reference</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold font-mono truncate block">
                        {currentEnquiry.customer_reference_code || enquiry.customer_reference_code}
                      </span>
                    </div>
                  )}

                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block uppercase font-mono text-[10px]">Enquiry Source</span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold font-sans truncate block">{normalizeEnquirySource(currentEnquiry.enquiry_source || enquiry.enquiry_source)}</span>
                  </div>
                </div>

                {/* Optional Subject Banner if present */}
                {(currentEnquiry.subject || enquiry.subject) && (
                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/70">
                    <span className="text-slate-400 dark:text-slate-500 block uppercase font-mono text-[10px]">Subject</span>
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-0.5 leading-relaxed">
                      {currentEnquiry.subject || enquiry.subject}
                    </p>
                  </div>
                )}

                {/* Timeline Dates Compact Sub-grid */}
                <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800/70">
                  <div className="flex items-center space-x-1.5 text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-2 font-bold">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>Timeline Dates</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 block uppercase font-mono text-[10px]">Received</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold font-mono text-xs">{enquiry.enquiry_date || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 block uppercase font-mono text-[10px]">Projected Order</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold font-mono text-xs">{enquiry.projected_order_date || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 block uppercase font-mono text-[10px]">Next Follow-up</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold font-mono text-xs">{enquiry.next_followup_date || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 block uppercase font-mono text-[10px]">System Created</span>
                      <span className="text-slate-600 dark:text-slate-400 font-medium font-mono text-xs">
                        {enquiry.createdAt ? new Date(enquiry.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collaborating Team & Sharing Card */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-mono text-slate-500 uppercase tracking-widest font-bold">
                      Team Access ({totalCollaboratorsCount + 1})
                    </h4>
                  </div>
                  {canManageSharing ? (
                    <button
                      type="button"
                      onClick={() => setIsShareModalOpen(true)}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-indigo-200 hover:border-indigo-300 transition shadow-2xs"
                      title="Add or Remove Team Collaborators"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Manage Access</span>
                    </button>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Shield className="w-3 h-3 text-slate-400" />
                      <span>View-only</span>
                    </span>
                  )}
                </div>

                <div className="space-y-2.5">
                  {/* Primary Deal Owner & Creator Handover Controls */}
                  <div className="flex flex-col gap-2.5 p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-full bg-amber-200 text-amber-800 font-mono font-bold text-xs flex items-center justify-center">
                          {(() => {
                            const sp = salespersons.find(
                              (s) =>
                                s.id === currentEnquiry.salesperson_id ||
                                s.id === currentEnquiry.sales_person_id ||
                                s.initials === currentEnquiry.sales_person ||
                                s.full_name === currentEnquiry.salesperson
                            );
                            return sp?.initials || (currentEnquiry.salesperson || currentEnquiry.sales_person || 'REP').slice(0, 2).toUpperCase();
                          })()}
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="text-xs font-bold text-slate-800 font-sans">
                              {(() => {
                                const sp = salespersons.find(
                                  (s) =>
                                    s.id === currentEnquiry.salesperson_id ||
                                    s.id === currentEnquiry.sales_person_id ||
                                    s.initials === currentEnquiry.sales_person ||
                                    s.full_name === currentEnquiry.salesperson
                                );
                                return sp ? sp.full_name : (currentEnquiry.salesperson || currentEnquiry.sales_person || 'Assigned Representative');
                              })()}
                            </span>
                            <span className="text-[10px] font-semibold bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-md font-mono">
                              Primary Owner
                            </span>
                            {isCreatorOnly && (
                              <span className="text-[10px] font-semibold bg-white text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded-md font-sans">
                                Logged by You
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500">Universal record management &amp; primary attribution</span>
                        </div>
                      </div>
                      <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    </div>

                    {isCreatorOnly && (
                      <div className="pt-2 border-t border-amber-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <p className="text-[11px] text-amber-900/90 leading-snug">
                          Visible in your list because you created it. Hand over exclusive access to the assigned rep when ready.
                        </p>
                        <button
                          type="button"
                          onClick={handleReleaseCreatorAccess}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                          title="Release creator-only visibility on this enquiry so only the assigned rep (and Admins) see it"
                        >
                          Hand Over to Assigned Rep
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Collaborator chips */}
                  {totalCollaboratorsCount > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                        Active Collaborators ({totalCollaboratorsCount})
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {activeCollaboratorMembers.map((member) => (
                          <div
                            key={member.id || member.initials || member.full_name}
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-white border border-indigo-200 text-indigo-900 rounded-lg text-xs shadow-2xs transition hover:border-indigo-300"
                          >
                            <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] font-mono flex items-center justify-center shrink-0">
                              {member.initials || member.full_name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium font-sans">{member.full_name}</span>
                            {member.initials && (
                              <span className="text-[10px] font-mono text-indigo-500 font-bold">
                                ({member.initials})
                              </span>
                            )}
                            {canManageSharing && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCollaborator(member)}
                                className="ml-1 p-0.5 text-indigo-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                                title={`Revoke access for ${member.full_name}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}

                        {extraCollaboratorNames.map((name) => (
                          <div
                            key={name}
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs shadow-2xs"
                          >
                            <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] font-mono flex items-center justify-center shrink-0">
                              {name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium font-sans">{name}</span>
                            {canManageSharing && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCollaborator(name)}
                                className="ml-1 p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                                title={`Remove ${name}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}

                        {canManageSharing && (
                          <button
                            type="button"
                            onClick={() => setIsShareModalOpen(true)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-dashed border-indigo-300 text-indigo-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>Add</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-white border border-dashed border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-500">
                      <span>No additional collaborators added yet.</span>
                      {canManageSharing ? (
                        <button
                          type="button"
                          onClick={() => setIsShareModalOpen(true)}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Add Collaborator</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Only deal owners & admins can add</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Remarks */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-1.5">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-widest block">Remarks & Progress Logs</span>
                <p className="text-sm text-slate-700 leading-relaxed font-sans font-medium whitespace-pre-line">
                  {enquiry.remarks || 'No progress remarks documented for this enquiry yet.'}
                </p>
              </div>

              {/* Invoice details */}
              {(enquiry.invoice_po_no || enquiry.payment_status) && (
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3">
                  <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">Commercial Logs</h4>
                  <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                    {enquiry.invoice_po_no && (
                      <div>
                        <span className="text-slate-400 uppercase font-mono text-[10px] block">Invoice PO #</span>
                        <span className="text-slate-800 font-semibold font-mono">{enquiry.invoice_po_no}</span>
                      </div>
                    )}
                    {enquiry.payment_status && (
                      <div>
                        <span className="text-slate-400 uppercase font-mono text-[10px] block">Payment status</span>
                        <span className="text-slate-800 font-semibold">{enquiry.payment_status}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Attachments & Direct Custom Bucket Upload */}
              {((currentEnquiry.attachments && currentEnquiry.attachments.length > 0) || canEditEnquiry(user, activeWorkspace, currentEnquiry)) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">
                      Attachments ({(currentEnquiry.attachments || []).length})
                    </h4>
                    {canEditEnquiry(user, activeWorkspace, currentEnquiry) && (
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs">
                        {isUploadingDetailAttachment ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        ) : (
                          <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
                        )}
                        <span>{isUploadingDetailAttachment ? 'Uploading...' : 'Attach File'}</span>
                        <input
                          type="file"
                          multiple
                          accept="application/pdf,image/png,image/jpeg,text/plain,.docx,.eml"
                          onChange={(e) => {
                            handleDetailFileUpload(e.target.files);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {currentEnquiry.attachments && currentEnquiry.attachments.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {currentEnquiry.attachments.map((file, idx) => {
                        const f = file as any;
                        const fileUrl = f.url || f.fileUrl || f.downloadURL || f.downloadUrl || f.file_url || f.dataUrl || f.src || '';
                        const isImg = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
                        const isPdf = file.type?.includes('pdf') || /\.pdf$/i.test(file.name);
                        const ext = file.name.split('.').pop()?.toUpperCase() || (isPdf ? 'PDF' : isImg ? 'IMG' : 'FILE');

                        const normalizedFile: Attachment = {
                          ...file,
                          url: fileUrl
                        };

                        return (
                          <div
                            key={idx}
                            className="group bg-white border border-slate-200 hover:border-blue-400 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition shadow-2xs"
                          >
                            {/* Thumbnail / File Info */}
                            <div
                              onClick={() => setPreviewAttachment(normalizedFile)}
                              className="flex items-center space-x-3 min-w-0 cursor-pointer flex-1"
                              title="Click to preview file in-app"
                            >
                              <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 shrink-0 group-hover:scale-105 transition">
                                {isImg ? (
                                  <ImageIcon className="w-4 h-4" />
                                ) : isPdf ? (
                                  <FileText className="w-4 h-4 text-red-500" />
                                ) : (
                                  <Paperclip className="w-4 h-4" />
                                )}
                              </div>
                              <div className="truncate">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="truncate font-semibold text-xs text-slate-800 group-hover:text-blue-600 transition">
                                    {file.name}
                                  </span>
                                  <span className="text-[9px] font-mono font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">
                                    {ext}
                                  </span>
                                  {!file.isLocal && fileUrl && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) ? (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
                                      <Cloud className="w-2.5 h-2.5 text-blue-600" />
                                      <span>Cloud Synced</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded shrink-0" title={file.uploadedByUserName ? `Stored locally on ${file.uploadedByUserName}'s device` : 'Stored locally on uploader device'}>
                                      <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                                      <span>Local Device</span>
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  {((file.size || 0) / 1024).toFixed(1)} KB
                                  {file.uploadedAt && ` • ${new Date(file.uploadedAt).toLocaleDateString()}`}
                                  {file.uploadedByUserName && ` • By ${file.uploadedByUserName}`}
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons: Quote Annex Toggle, Promote to Cloud, Preview, Download, Delete */}
                            <div className="flex items-center flex-wrap gap-1.5 shrink-0 self-end sm:self-center">
                              {canEditEnquiry(user, activeWorkspace, currentEnquiry) && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleAttachmentQuoteAnnex(idx)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap ${
                                    file.include_in_quote_annex
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                                  }`}
                                  title="Toggle to automatically include this file in Quotation Studio Technical Annexes"
                                >
                                  <FileCheck className="w-3.5 h-3.5" />
                                  <span>{file.include_in_quote_annex ? 'In Quote Annex' : 'Quote Annex'}</span>
                                </button>
                              )}

                              {Boolean(activeWorkspace?.settings?.storage?.supabaseUrl && activeWorkspace?.settings?.storage?.bucket && activeWorkspace?.settings?.storage?.supabaseAnonKey) && (file.isLocal || !fileUrl.startsWith('http')) && (
                                <button
                                  type="button"
                                  onClick={() => handlePromoteAttachmentToCloud(idx)}
                                  disabled={promotingAttachmentKey === (file.storageKey || file.id || `att_${idx}`)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs disabled:opacity-50"
                                  title="Upload this local attachment to Supabase Cloud Storage to share across team devices"
                                >
                                  {promotingAttachmentKey === (file.storageKey || file.id || `att_${idx}`) ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                                  ) : (
                                    <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
                                  )}
                                  <span>Upload to Cloud</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setPreviewAttachment(normalizedFile)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
                                title="Preview attachment in-app"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Preview</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownloadAttachment(normalizedFile)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-150 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition cursor-pointer shadow-2xs"
                                title="Download proposal attachment"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download</span>
                              </button>

                              {canEditEnquiry(user, activeWorkspace, currentEnquiry) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAttachment(idx)}
                                  disabled={deletingAttachmentKey === (file.storageKey || file.id || `att_${idx}`)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer disabled:opacity-50"
                                  title="Remove attachment"
                                >
                                  {deletingAttachmentKey === (file.storageKey || file.id || `att_${idx}`) ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <label
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer?.files?.length) {
                          handleDetailFileUpload(e.dataTransfer.files);
                        }
                      }}
                      className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-5 text-center transition cursor-pointer block bg-slate-50/50"
                    >
                      <UploadCloud className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                      <span className="text-xs font-semibold text-slate-700 block">
                        Drag & drop RFQ PDFs, specs, or images here, or click to upload
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                        Synced via Custom Bucket storage • Toggle any file to auto-attach into Quotation Annexes
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="application/pdf,image/png,image/jpeg,text/plain,.docx,.eml"
                        onChange={(e) => {
                          handleDetailFileUpload(e.target.files);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Original Pasted Source */}
              {enquiry.raw_source_text && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">Original Pasted Source</h4>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(enquiry.raw_source_text || '');
                          if (triggerToast) triggerToast('Copied raw context to clipboard!', 'info');
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="flex items-center space-x-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition text-[10px] font-semibold"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy to Clipboard</span>
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-800 max-h-60 overflow-y-auto shadow-2xs">
                    {enquiry.raw_source_text}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === 'items' && (
            <div className="space-y-4">
              {/* Interactive Quotation Sync Prompt Banner when Line Items were updated */}
              {showQuoteSyncPrompt && quotations.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                      <RefreshCw className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>Line Items Updated — Sync with Formal Quotations?</span>
                    </div>
                    <p className="text-xs text-indigo-700">
                      Keep your commercial offer aligned by syncing into the active Draft or forking a new Revision (R{quotations.reduce((m, q) => Math.max(m, q.revision_number || 1), 1) + 1}).
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {quotations.some((q) => q.status === 'Draft') && (
                      <button
                        type="button"
                        disabled={isSyncingQuoteItems}
                        onClick={() => handleSyncLineItemsToQuote('sync_draft')}
                        className="px-3 py-1.5 bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        Sync to Active Draft
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isSyncingQuoteItems}
                      onClick={() => handleSyncLineItemsToQuote('new_revision')}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <GitFork className="w-3.5 h-3.5" />
                      <span>Create Revision R{quotations.reduce((m, q) => Math.max(m, q.revision_number || 1), 1) + 1}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQuoteSyncPrompt(false)}
                      className="p-1 text-indigo-400 hover:text-indigo-700 rounded-lg cursor-pointer"
                      title="Dismiss"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Deal Profitability, Subtotal Excl. VAT, 5% VAT & Gross Margin Summary Strip */}
              {!isMaskedForBasic && (
                (() => {
                  const sourceList = isInlineEditingItems ? draftLineItems : (currentEnquiry.line_items || []);
                  if (sourceList.length === 0) return null;
                  const currSymbol = currentEnquiry.currency === 'USD' ? '$' : 'AED ';
                  const baselineList = sourceList.filter((li) => {
                    const opt = String((li as any).option_designation || li.option || 'Default / Included').trim();
                    return !opt || opt === 'Default / Included' || opt === 'Baseline / All' || opt === 'Option A' || opt.startsWith('Option A ');
                  });
                  const calcList = baselineList.length > 0 ? baselineList : sourceList;

                  const totalSelling = calcList.reduce((sum, li) => {
                    const isDisc = li.item_type === 'discount' || (li as any).classification === 'Discount / Rebate';
                    const tot = Number(li.total_price) || (Number(li.quantity) || 0) * (Number(li.unit_price) || 0);
                    return isDisc ? sum - Math.abs(tot) : sum + tot;
                  }, 0);
                  const totalCost = calcList.reduce((sum, li) => {
                    const isDisc = li.item_type === 'discount' || (li as any).classification === 'Discount / Rebate';
                    if (isDisc) return sum;
                    return sum + (Number(li.quantity) || 0) * (Number(li.cost_price) || 0);
                  }, 0);
                  const isNoVat = effectiveCommercialTerms.taxMode === 'no_vat';
                  const vatAmount = isNoVat ? 0 : Math.round(totalSelling * 0.05 * 100) / 100;
                  const grandTotalInclVat = totalSelling + vatAmount;
                  const hasAnyCost = calcList.some((li) => (Number(li.cost_price) || 0) > 0);
                  const estProfit = totalSelling - totalCost;
                  const marginPct = totalSelling > 0 && hasAnyCost ? (estProfit / totalSelling) * 100 : null;

                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                            Commercial Summary
                          </span>
                          {baselineList.length < sourceList.length && (
                            <span className="text-[10px] font-mono bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                              Excludes {sourceList.length - baselineList.length} Optional/Alt item(s)
                            </span>
                          )}
                        </div>
                        {marginPct !== null && (
                          <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                            <span>
                              <span className="text-slate-400 mr-1">Est. Profit:</span>
                              <span className={`font-bold ${estProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {currSymbol}{estProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[11px] border ${
                                marginPct >= 20
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : marginPct >= 0
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {marginPct.toFixed(1)}% Gross Margin
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/80 text-xs font-mono tabular-nums">
                        <div className="bg-white border border-slate-200/80 rounded-lg px-2.5 py-1.5">
                          <span className="text-[10px] text-slate-400 uppercase block">Total Cost (Excl. VAT)</span>
                          <span className="font-semibold text-slate-700">
                            {hasAnyCost ? `${currSymbol}${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                          </span>
                        </div>
                        <div className="bg-white border border-slate-200/80 rounded-lg px-2.5 py-1.5">
                          <span className="text-[10px] text-slate-400 uppercase block">Subtotal (Excl. VAT)</span>
                          <span className="font-bold text-slate-900">
                            {currSymbol}{totalSelling.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="bg-white border border-slate-200/80 rounded-lg px-2.5 py-1.5">
                          <span className="text-[10px] text-slate-400 uppercase block">
                            {isNoVat ? '0% VAT (No VAT)' : '5% VAT'}
                          </span>
                          <span className="font-semibold text-slate-700">
                            {currSymbol}{vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="bg-blue-50/60 border border-blue-200 rounded-lg px-2.5 py-1.5">
                          <span className="text-[10px] text-blue-600 uppercase font-bold block">
                            {isNoVat ? 'Grand Total (Excl. VAT)' : 'Grand Total (Incl. VAT)'}
                          </span>
                          <span className="font-bold text-blue-700">
                            {currSymbol}{grandTotalInclVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Compact Commercial Terms Summary & Quick-Edit Strip on Line Items Tab */}
              {renderCommercialTermsSummaryStrip()}

              {/* Commercial Option Comparison Banner */}
              {optionAnalysis.hasMultipleOptions && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 mb-2 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">
                          Baseline Package Total ({optionAnalysis.baselineCount} items)
                        </span>
                        <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                          {formatCurrency(optionAnalysis.baselineTotal)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {(Object.entries(optionAnalysis.alternativeTotals) as [string, { count: number; total: number }][]).map(([optName, optData]) => (
                        <span
                          key={optName}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-medium bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs"
                          title={`${optName} Alternative Subtotal`}
                        >
                          <span className="font-bold">{optName}:</span>
                          <span>{formatCurrency(optData.total)}</span>
                          <span className="text-[10px] opacity-75">({optData.count} items)</span>
                        </span>
                      ))}

                      {optionAnalysis.optionalTotal > 0 && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-medium bg-purple-50 text-purple-800 border border-purple-200 shadow-2xs"
                          title="Optional / Add-On Electives Total"
                        >
                          <span className="font-bold">Optionals:</span>
                          <span>+{formatCurrency(optionAnalysis.optionalTotal)}</span>
                          <span className="text-[10px] opacity-75">({optionAnalysis.optionalCount} items)</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Line Items Toolbar: Quick Add Catalog, Custom Item, & Inline Edit Controls */}
              <div className="border-b border-slate-100 pb-3 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2 text-xs text-slate-500 font-mono">
                    <ListOrdered className="w-4 h-4 text-blue-600" />
                    <span>Line Items & Specifications ({(isInlineEditingItems ? draftLineItems : (currentEnquiry.line_items || [])).length})</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {canEditEnquiry(user, activeWorkspace, currentEnquiry) && (
                      <>
                        {(isInlineEditingItems ? draftLineItems : (currentEnquiry.line_items || [])).some(
                          (li) => !(li.item_name || '').trim() && (li.description || '').trim()
                        ) && (
                          <button
                            type="button"
                            onClick={handleCleanUpLegacyTitles}
                            className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                            title="Split combined description strings into clean Item Name + Technical Spec"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span>Clean Up Legacy Titles</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowQuickCatalogPicker(!showQuickCatalogPicker)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                        >
                          <Package className="w-3.5 h-3.5" />
                          <span>Add from Catalog</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleQuickAddCustomItem}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Custom Item</span>
                        </button>
                        {(isInlineEditingItems ? draftLineItems : (currentEnquiry.line_items || [])).length > 0 && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowBulkApplyPopover((prev) => !prev)}
                              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                              title="Bulk apply Delivery / Lead Time or Country of Origin across all line items"
                            >
                              <span>⚡ Bulk Apply to All Items ▾</span>
                            </button>
                            {showBulkApplyPopover && (
                              <div className="absolute right-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-40 space-y-3 text-left">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <span className="text-[11px] font-bold text-slate-800">
                                    ⚡ Bulk Apply to All Line Items
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setShowBulkApplyPopover(false)}
                                    className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
                                  >
                                    ✕
                                  </button>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                                    Set Delivery / Lead Time for All
                                  </label>
                                  <div className="flex flex-wrap gap-1">
                                    {[
                                      'LIMITED STOCK AVAILABLE. Subject to prior sales.',
                                      'Ex-Stock',
                                      '2–3 Weeks',
                                      '4–6 Weeks',
                                      '6–8 Weeks'
                                    ].map((chip) => (
                                      <button
                                        key={chip}
                                        type="button"
                                        onClick={() => handleBulkApplyFieldToLineItems('delivery', chip)}
                                        className="px-2 py-1 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 text-[10px] font-medium transition cursor-pointer text-left"
                                      >
                                        {chip}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex gap-1.5 pt-1">
                                    <input
                                      type="text"
                                      value={bulkDeliveryInput}
                                      onChange={(e) => setBulkDeliveryInput(e.target.value)}
                                      placeholder="Custom delivery note..."
                                      className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleBulkApplyFieldToLineItems('delivery', bulkDeliveryInput);
                                        setBulkDeliveryInput('');
                                      }}
                                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                                    >
                                      Apply
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-1.5 border-t border-slate-100 pt-2">
                                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                                    Set Country of Origin for All
                                  </label>
                                  <div className="flex flex-wrap gap-1">
                                    {['USA', 'Germany / EU', 'Italy', 'UAE', 'UK', 'China'].map((originChip) => (
                                      <button
                                        key={originChip}
                                        type="button"
                                        onClick={() => handleBulkApplyFieldToLineItems('origin', originChip)}
                                        className="px-2 py-1 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 text-[10px] font-medium transition cursor-pointer"
                                      >
                                        {originChip}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex gap-1.5 pt-1">
                                    <input
                                      type="text"
                                      value={bulkOriginInput}
                                      onChange={(e) => setBulkOriginInput(e.target.value)}
                                      placeholder="Custom origin..."
                                      className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleBulkApplyFieldToLineItems('origin', bulkOriginInput);
                                        setBulkOriginInput('');
                                      }}
                                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                                    >
                                      Apply
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {isInlineEditingItems ? (
                          <>
                            <button
                              type="button"
                              disabled={isSavingInlineItems}
                              onClick={handleSaveInlineLineItems}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                            >
                              {isSavingInlineItems ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              <span>Save Items</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDraftLineItems(currentEnquiry.line_items || []);
                                setIsInlineEditingItems(false);
                              }}
                              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDraftLineItems(currentEnquiry.line_items || []);
                              setIsInlineEditingItems(true);
                            }}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Quick Edit</span>
                          </button>
                        )}
                      </>
                    )}

                    {!isInlineEditingItems && filteredLineItems.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleExpandAllItems}
                        className="text-[11px] font-mono text-slate-600 hover:text-slate-900 font-semibold flex items-center space-x-1 py-1.5 px-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition cursor-pointer"
                      >
                        <ChevronsUpDown className="w-3.5 h-3.5" />
                        <span>
                          {filteredLineItems.every((item) => {
                            const origIdx = currentEnquiry.line_items ? currentEnquiry.line_items.indexOf(item) : -1;
                            return origIdx >= 0 ? !!expandedItemIndices[origIdx] : false;
                          })
                            ? 'Collapse All'
                            : 'Expand All'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Quick Catalog Picker Drawer (Upgraded with Category & Stock Filters) */}
                {showQuickCatalogPicker && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={quickCatalogSearch ?? ''}
                          onChange={(e) => setQuickCatalogSearch(e.target.value)}
                          placeholder="Search Products Catalog by name, SKU, brand, model, or specs..."
                          className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(['all', 'in_stock', 'low_stock'] as const).map((filterKey) => (
                          <button
                            key={filterKey}
                            type="button"
                            onClick={() => setQuickCatalogStockFilter(filterKey)}
                            className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold border transition cursor-pointer ${
                              quickCatalogStockFilter === filterKey
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {filterKey === 'all' ? 'All Stock' : filterKey === 'in_stock' ? 'In Stock' : 'Low Stock'}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setShowQuickCatalogPicker(false)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Category Filter Pills */}
                    {(() => {
                      const cats = Array.from(new Set((products || []).filter((p) => !p.is_deleted).map((p) => p.product_type || 'Other')));
                      if (cats.length <= 1) return null;
                      return (
                        <div className="flex items-center gap-1 overflow-x-auto pb-1">
                          <button
                            type="button"
                            onClick={() => setQuickCatalogCategory('ALL')}
                            className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold whitespace-nowrap transition cursor-pointer ${
                              quickCatalogCategory === 'ALL'
                                ? 'bg-slate-800 text-white'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            All Categories
                          </button>
                          {cats.map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setQuickCatalogCategory(cat)}
                              className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold whitespace-nowrap transition cursor-pointer ${
                                quickCatalogCategory === cat
                                  ? 'bg-slate-800 text-white'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                    <div className="max-h-64 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(() => {
                        const variantAnalysisMap = catalogVariantAnalysisMap;
                        return (products || [])
                          .filter((p) => {
                            if (p.is_deleted) return false;
                            if (quickCatalogCategory !== 'ALL' && (p.product_type || 'Other') !== quickCatalogCategory) return false;
                            const avail = (p.stock_on_hand || 0) - (p.stock_reserved || 0);
                            const isLow = Boolean(p.is_inventoried) && avail <= (p.reorder_level || 0);
                            if (quickCatalogStockFilter === 'in_stock' && (!p.is_inventoried || avail <= 0)) return false;
                            if (quickCatalogStockFilter === 'low_stock' && !isLow) return false;

                            const q = quickCatalogSearch.toLowerCase().trim();
                            if (!q) return true;
                            return (
                              (p.name || '').toLowerCase().includes(q) ||
                              (p.sku || '').toLowerCase().includes(q) ||
                              (p.brand_make || '').toLowerCase().includes(q) ||
                              (p.model_part_no || '').toLowerCase().includes(q) ||
                              (p.description || '').toLowerCase().includes(q) ||
                              (p.attributes || []).some((a) => `${a.key} ${a.value}`.toLowerCase().includes(q))
                            );
                          })
                          .slice(0, 30)
                          .map((p) => {
                            const avail = (p.stock_on_hand || 0) - (p.stock_reserved || 0);
                            const isLow = Boolean(p.is_inventoried) && avail <= (p.reorder_level || 0);
                            const sell = Number(p.unit_price) || 0;
                            const cost = Number(p.cost_price ?? p.cost_price_aed) || 0;
                            const marginPct = sell > 0 && cost > 0 ? ((sell - cost) / sell) * 100 : null;
                            const cleanUnit = !p.unit || p.unit === 'Custom Unit' ? 'Nos' : p.unit;
                            const vInfo = p.id ? variantAnalysisMap.get(p.id) : undefined;
                            return (
                              <div
                                key={p.id}
                                onClick={() => handleQuickAddCatalogProduct(p)}
                                className="bg-white hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 rounded-lg p-2.5 flex items-center justify-between gap-2 cursor-pointer transition"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {p.image_url ? (
                                    <img
                                      src={p.image_url}
                                      alt={p.name}
                                      className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-200 p-0.5 shrink-0"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                      <Package className="w-4 h-4" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <div className="text-xs font-bold text-slate-800 truncate">{p.name || p.product_type}</div>
                                      {vInfo?.isVariant && (
                                        <span className="text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded whitespace-nowrap shrink-0">
                                          Variant • {vInfo.siblingCount} SKUs
                                        </span>
                                      )}
                                      {p.is_composite_set && p.sub_components && p.sub_components.length > 0 && (
                                        <span className="text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded whitespace-nowrap shrink-0">
                                          Kit ({p.sub_components.length})
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] font-mono text-slate-500 truncate">
                                      {[p.brand_make, p.model_part_no, p.sku ? `SKU: ${p.sku}` : ''].filter(Boolean).join(' · ') || p.product_type}
                                    </div>
                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                      <span className="text-[9px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                                        Unit: {cleanUnit}
                                      </span>
                                      {p.is_inventoried ? (
                                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${isLow ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                          Avail: {avail} {cleanUnit}
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-mono text-slate-400">
                                          {p.default_availability || 'Order / Non-Stock'}
                                        </span>
                                      )}
                                      {vInfo?.isVariant ? (
                                        <>
                                          {vInfo.differentiatingAttributes.slice(0, 3).map((attr, aIdx) => (
                                            <span
                                              key={`diff-${aIdx}`}
                                              className="text-[9px] font-mono font-bold bg-indigo-100/90 border border-indigo-300 text-indigo-900 px-1.5 py-0.2 rounded truncate max-w-[130px]"
                                              title={`Differentiating Variant Spec — ${attr.key}: ${attr.value}`}
                                            >
                                              {attr.key}: {attr.value}
                                            </span>
                                          ))}
                                          {vInfo.sharedAttributes.slice(0, 2).map((attr, aIdx) => (
                                            <span
                                              key={`shared-${aIdx}`}
                                              className="text-[9px] font-mono bg-slate-50 border border-slate-200 text-slate-500 px-1 py-0.2 rounded truncate max-w-[110px]"
                                            >
                                              {attr.key}: {attr.value}
                                            </span>
                                          ))}
                                        </>
                                      ) : (
                                        (p.attributes || []).slice(0, 3).map((attr, aIdx) => (
                                          <span key={aIdx} className="text-[9px] font-mono bg-slate-50 border border-slate-200 text-slate-600 px-1 rounded truncate max-w-[110px]">
                                            {attr.key}: {attr.value}
                                          </span>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right font-mono tabular-nums shrink-0">
                                  <span className={`text-xs font-bold block ${sell > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                    {sell > 0 ? `AED ${sell.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'AED 0.00 (Custom)'}
                                  </span>
                                  {marginPct !== null && (
                                    <span className="text-[9px] text-slate-400 block">
                                      {marginPct.toFixed(0)}% Margin
                                    </span>
                                  )}
                                  <span className="text-[10px] text-blue-600 font-sans font-semibold">+ Add</span>
                                </div>
                              </div>
                            );
                          });
                      })()}
                    </div>
                  </div>
                )}

                {/* Option Filter Pill Navigation */}
                {!isInlineEditingItems && optionAnalysis.detectedOptions.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveOptionTab('ALL')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-sans font-medium transition cursor-pointer flex items-center gap-1.5 ${
                        activeOptionTab === 'ALL'
                          ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>All Items</span>
                      <span className={`font-mono text-[10px] ${activeOptionTab === 'ALL' ? 'text-blue-100' : 'text-slate-400'}`}>
                        ({currentEnquiry.line_items?.length || 0})
                      </span>
                    </button>

                    {optionAnalysis.detectedOptions.map((optName) => {
                      const count = optionAnalysis.groupMap[optName]?.count || 0;
                      const isActive = activeOptionTab === optName;
                      return (
                        <button
                          key={optName}
                          type="button"
                          onClick={() => setActiveOptionTab(optName)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-sans font-medium transition cursor-pointer flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span>{optName}</span>
                          <span className={`font-mono text-[10px] ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                            ({count})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {isInlineEditingItems ? (
                /* Full-Parity Inline Editor Mode for Line Items */
                <div className="space-y-3">
                  {draftLineItems.map((item, idx) => {
                    const matchedProduct = (products || []).find(
                      (p) =>
                        (item.product_id && p.id === item.product_id) ||
                        (item.sku && p.sku && p.sku.toLowerCase() === item.sku.toLowerCase())
                    );
                    const thumbUrl = item.image_url || matchedProduct?.image_url;
                    const sell = Number(item.unit_price) || 0;
                    const cost = Number(item.cost_price) || 0;
                    const marginPct = sell > 0 && cost > 0 ? ((sell - cost) / sell) * 100 : null;
                    const parsedLegacy = parseLineItemTitleAndSpec(item.item_name, item.description);
                    const canSplitLegacy = !(item.item_name || '').trim() && (item.description || '').trim();
                    const isDrifted = matchedProduct ? hasCatalogDrift(item, matchedProduct, currentEnquiry.currency) : false;

                    return (
                      <div key={item.id || idx} className="bg-white border border-blue-200/90 rounded-2xl p-4 space-y-3.5 shadow-xs">
                        {/* Row 1: Thumbnail, Item Name / Heading, Legacy Split Helper, Catalog Sync & Move/Delete */}
                        <div className="flex items-center justify-between gap-2.5 flex-wrap pb-2.5 border-b border-slate-100">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md shrink-0">
                              #{idx + 1}
                            </span>
                            {thumbUrl && (
                              <img
                                src={thumbUrl}
                                alt={item.item_name || 'Item'}
                                className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <input
                              type="text"
                              value={item.item_name ?? ''}
                              onChange={(e) => handleDraftItemChange(idx, 'item_name', e.target.value)}
                              placeholder={canSplitLegacy ? `Suggested: ${parsedLegacy.title}` : 'Item Name / Heading (e.g. Industrial Control Unit)'}
                              className="flex-1 min-w-[180px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                            />
                            {canSplitLegacy && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleDraftItemChange(idx, 'item_name', parsedLegacy.title);
                                  handleDraftItemChange(idx, 'description', parsedLegacy.spec);
                                }}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap cursor-pointer shrink-0 transition"
                                title="Split combined description into Item Name and Technical Spec"
                              >
                                Split Title & Spec
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                            {!matchedProduct ? (
                              <>
                                <select
                                  value=""
                                  onChange={(e) => {
                                    const chosenId = e.target.value;
                                    if (!chosenId) return;
                                    const chosenProd = (products || []).find((p) => p.id === chosenId);
                                    if (!chosenProd) return;
                                    const wasPopulated = isLineItemPopulated(item);
                                    const merged = linkLineItemToCatalogProductNonDestructive(
                                      item,
                                      chosenProd,
                                      currentEnquiry.currency,
                                      false
                                    );
                                    setDraftLineItems((prev) =>
                                      prev.map((li, i) => (i === idx ? merged : li))
                                    );
                                    if (triggerToast) {
                                      const skuLabel = chosenProd.sku || chosenProd.name || 'Catalog SKU';
                                      if (wasPopulated) {
                                        triggerToast(
                                          `Linked to SKU ${skuLabel} — kept your custom quote price & specs intact. Use the SKU Sync menu to Save as Variant, Push to Catalog, or Pull Catalog Defaults.`,
                                          'info'
                                        );
                                      } else {
                                        triggerToast(`Linked line item to SKU ${skuLabel}.`, 'success');
                                      }
                                    }
                                  }}
                                  className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 cursor-pointer max-w-[165px] truncate focus:outline-none"
                                  title="Non-destructively link this item to an existing Catalog SKU (keeps your custom quote price & specs intact)"
                                >
                                  <option value="">🔗 Link SKU...</option>
                                  {(products || []).map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.sku ? `[${p.sku}] ` : ''}
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => setSaveToCatalogState({ isOpen: true, item, itemIndex: idx, isFromDraft: true })}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 transition"
                                  title="Register this custom line item in the Products Catalog (New SKU or Spec Variant)"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Save to Catalog</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-[11px] font-mono font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0">
                                  Linked: {matchedProduct.sku || 'Catalog'}
                                </span>
                                <CatalogSyncMenu
                                  item={item}
                                  matchedProduct={matchedProduct}
                                  products={products}
                                  setProducts={setProducts}
                                  currency={currentEnquiry.currency}
                                  activeWorkspaceId={activeWorkspace?.id}
                                  triggerToast={triggerToast}
                                  compact
                                  onUpdateLineItem={(patch) => {
                                    setDraftLineItems((prev) =>
                                      prev.map((li, i) => (i === idx ? { ...li, ...patch } : li))
                                    );
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDraftLineItems((prev) =>
                                      prev.map((li, i) =>
                                        i === idx
                                          ? { ...li, product_id: undefined, sku: undefined, product_sku: undefined, variant_id: undefined, variant_name: undefined }
                                          : li
                                      )
                                    );
                                  }}
                                  className="text-[10px] text-slate-400 hover:text-rose-600 underline cursor-pointer px-1"
                                  title="Unlink from Catalog SKU"
                                >
                                  Unlink
                                </button>
                              </>
                            )}

                            {!(item.is_composite_set || (item.sub_components && item.sub_components.length > 0)) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const seed = [
                                    {
                                      id: `sub_${Date.now()}_1`,
                                      sn: '1',
                                      item_name: '',
                                      remark: '',
                                      quantity: 1,
                                      unit: 'Nos',
                                      cost_price: 0,
                                      unit_price: 0,
                                      total_price: 0,
                                      line_total: 0,
                                      is_included_accessory: true
                                    }
                                  ];
                                  setDraftLineItems((prev) => {
                                    const next = [...prev];
                                    next[idx] = {
                                      ...next[idx],
                                      is_composite_set: true,
                                      sub_components: seed,
                                      package_pricing_mode: 'lump_sum'
                                    };
                                    return next;
                                  });
                                }}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 transition"
                                title="Add included items or accessories under this item without changing the main price"
                              >
                                <Boxes className="w-3 h-3 shrink-0" />
                                <span>+ Included Items</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                const { clonedItem, targetOption, updatedSourceOption } = cloneLineItemToNextOption(
                                  item,
                                  draftLineItems
                                );
                                setDraftLineItems((prev) => {
                                  const next = [...prev];
                                  if (updatedSourceOption) {
                                    next[idx] = {
                                      ...next[idx],
                                      option: updatedSourceOption,
                                      item_option: updatedSourceOption,
                                      option_designation: updatedSourceOption
                                    };
                                  }
                                  next.splice(idx + 1, 0, clonedItem);
                                  return next;
                                });
                                if (triggerToast) {
                                  triggerToast(
                                    `Cloned "${item.item_name || item.product_type || 'Line Item'}" as ${targetOption}!`,
                                    'success'
                                  );
                                }
                              }}
                              className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 transition"
                              title="Clone this item (and all sub-components) into the next Option group (e.g. Option B)"
                            >
                              <GitFork className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span>Clone Option</span>
                            </button>

                            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveDraftItem(idx, 'up')}
                                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-white rounded-md disabled:opacity-30 cursor-pointer transition"
                                title="Move Up"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === draftLineItems.length - 1}
                                onClick={() => handleMoveDraftItem(idx, 'down')}
                                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-white rounded-md disabled:opacity-30 cursor-pointer transition"
                                title="Move Down"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveDraftItem(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition"
                              title="Remove Line Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Row 2: Commercial Pricing Grid (4 Balanced Columns with Aligned Labels) */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-start">
                          <div className="min-w-0">
                            <div className="h-4 flex items-center mb-1">
                              <label className="text-[10px] font-mono uppercase font-semibold text-slate-500 whitespace-nowrap">Quantity</label>
                            </div>
                            <input
                              type="number"
                              value={item.quantity ?? ''}
                              onChange={(e) => handleDraftItemChange(idx, 'quantity', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="h-4 flex items-center mb-1">
                              <label className="text-[10px] font-mono uppercase font-semibold text-slate-500 whitespace-nowrap">Unit (UOM)</label>
                            </div>
                            <input
                              type="text"
                              value={item.unit ?? ''}
                              placeholder="Nos / Set"
                              onChange={(e) => handleDraftItemChange(idx, 'unit', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-sans text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="h-4 flex items-center justify-between mb-1">
                              <label className="text-[10px] font-mono uppercase font-semibold text-slate-500 whitespace-nowrap">Selling Price</label>
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              value={item.unit_price ?? ''}
                              onChange={(e) => handleDraftItemChange(idx, 'unit_price', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="h-4 flex items-center justify-between gap-1 mb-1">
                              <label className="text-[10px] font-mono uppercase font-semibold text-slate-500 whitespace-nowrap">Unit Cost</label>
                              {marginPct !== null && (
                                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded whitespace-nowrap shrink-0 ${marginPct >= 20 ? 'bg-emerald-50 text-emerald-700' : marginPct >= 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                                  {marginPct.toFixed(0)}% Margin
                                </span>
                              )}
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              value={item.cost_price ?? ''}
                              placeholder="0.00"
                              onChange={(e) => handleDraftItemChange(idx, 'cost_price', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-700 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        {/* Row 3: Lead Time, Option Scope, Brand / Make, Model / Part #, Origin & HS Code */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 items-start">
                          <div className="min-w-0">
                            <div className="h-4 flex items-center mb-1">
                              <label className="text-[10px] font-mono uppercase font-semibold text-slate-500 whitespace-nowrap">Lead Time</label>
                            </div>
                            <input
                              type="text"
                              value={item.lead_time_note ?? ''}
                              placeholder="Ex-Stock / 2-3 Wks"
                              onChange={(e) => handleDraftItemChange(idx, 'lead_time_note', e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-sans text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="h-4 flex items-center mb-1">
                              <label className="text-[10px] font-mono uppercase font-semibold text-slate-500 whitespace-nowrap">Option Scope</label>
                            </div>
                            <select
                              value={((item as any).option_designation || item.option || 'Default / Included') ?? 'Default / Included'}
                              onChange={(e) => {
                                handleDraftItemChange(idx, 'option', e.target.value);
                                handleDraftItemChange(idx, 'option_designation' as any, e.target.value);
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-sans text-slate-800 focus:outline-none focus:border-blue-500"
                            >
                              <option value="Default / Included">Baseline / Included</option>
                              <option value="Option A">Option A (Baseline)</option>
                              <option value="Option B">Option B (Alternative)</option>
                              <option value="Option C">Option C (Alternative)</option>
                              <option value="Optional / Add-On">Optional / Add-On</option>
                            </select>
                          </div>
                          <div className="min-w-0">
                            <div className="h-4 flex items-center mb-1">
                              <label className="text-[10px] font-mono uppercase font-semibold text-slate-500 whitespace-nowrap">Brand / Make</label>
                            </div>
                            <input
                              type="text"
                              value={item.brand_make ?? ''}
                              placeholder="Manufacturer / Brand"
                              onChange={(e) => handleDraftItemChange(idx, 'brand_make', e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-sans text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="h-4 flex items-center mb-1">
                              <label className="text-[10px] font-mono uppercase font-semibold text-slate-500 whitespace-nowrap">Model / Part #</label>
                            </div>
                            <input
                              type="text"
                              value={item.model_part_no ?? ''}
                              placeholder="Model / Part No."
                              onChange={(e) => handleDraftItemChange(idx, 'model_part_no', e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="h-4 flex items-center mb-1">
                              <label className="text-[10px] font-mono uppercase font-semibold text-slate-500 whitespace-nowrap">Country of Origin</label>
                            </div>
                            <input
                              type="text"
                              value={item.country_of_origin ?? ''}
                              placeholder="e.g. Germany, UAE"
                              onChange={(e) => handleDraftItemChange(idx, 'country_of_origin', e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-sans text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="h-4 flex items-center mb-1">
                              <label className="text-[10px] font-mono uppercase font-semibold text-slate-500 whitespace-nowrap">HS Code</label>
                            </div>
                            <input
                              type="text"
                              value={item.hs_code ?? ''}
                              placeholder="e.g. 8537.10.00"
                              onChange={(e) => handleDraftItemChange(idx, 'hs_code', e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        {/* Row 4: Full-Width Technical Description & Notes */}
                        <div className="w-full min-w-0">
                          <div className="h-4 flex items-center mb-1">
                            <label className="text-[10px] font-mono uppercase font-semibold text-slate-500 whitespace-nowrap">Technical Description &amp; Notes</label>
                          </div>
                          <textarea
                            rows={3}
                            value={item.description ?? ''}
                            onChange={(e) => handleDraftItemChange(idx, 'description', e.target.value)}
                            placeholder="Detailed technical description, scope of supply, and specification notes..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 resize-y focus:outline-none focus:border-blue-500 focus:bg-white transition-all leading-relaxed"
                          />
                        </div>

                        {/* Row 4B: Progressive Image Options Popover, Annex Datasheet Toggle & Line Total Bar */}
                        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl px-3 py-2 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <label className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer flex items-center gap-1.5 border border-slate-200 shadow-2xs transition">
                                {uploadingInlineItemMedia?.idx === idx && uploadingInlineItemMedia?.type === 'datasheet' ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                                )}
                                <span>{item.datasheet_attachment?.url ? 'Change Datasheet' : 'Attach Datasheet'}</span>
                                <input
                                  type="file"
                                  accept=".pdf,image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleInlineItemMediaUpload(idx, f, 'datasheet');
                                    e.target.value = '';
                                  }}
                                />
                              </label>

                              {(item.datasheet_attachment?.url || matchedProduct?.datasheet_attachment?.url) && (
                                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50/70 border border-indigo-200/80 px-2.5 py-1 rounded-lg cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={item.include_datasheet_in_quote !== false}
                                    onChange={(e) => handleDraftItemChange(idx, 'include_datasheet_in_quote', e.target.checked)}
                                    className="rounded border-indigo-300 text-indigo-600"
                                  />
                                  <span>Annex Datasheet</span>
                                </label>
                              )}
                            </div>

                            <div className="flex items-center gap-2 ml-auto">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Line Total:</span>
                              <span className="text-sm font-mono tabular-nums font-bold text-blue-600">
                                {formatCurrency(item.total_price)}
                              </span>
                            </div>
                          </div>

                          <LineItemImageOptionsPopover
                            itemTitle={item.item_name || item.description || `Item #${idx + 1}`}
                            imageUrl={thumbUrl}
                            secondaryImageUrl={item.secondary_image_url || matchedProduct?.secondary_image_url}
                            imageCaption={item.image_caption ?? matchedProduct?.image_caption}
                            secondaryImageCaption={item.secondary_image_caption ?? matchedProduct?.secondary_image_caption}
                            imageAdjustments={item.image_adjustments || matchedProduct?.image_adjustments}
                            displayOverride={item.image_display_override || 'inherit'}
                            sizeOverride={item.image_size_override || 'inherit'}
                            aspectOverride={item.image_aspect_override || 'inherit'}
                            activeWorkspace={activeWorkspace}
                            triggerToast={triggerToast}
                            showOverrideControls={true}
                            canSyncToCatalog={Boolean(matchedProduct)}
                            onSyncToCatalog={
                              matchedProduct
                                ? async () => {
                                    await syncLineItemToCatalogProduct(
                                      item,
                                      matchedProduct,
                                      setProducts,
                                      triggerToast,
                                      currentEnquiry.currency
                                    );
                                  }
                                : undefined
                            }
                            onChange={(patch) => {
                              setDraftLineItems((prev) => {
                                const next = [...prev];
                                next[idx] = {
                                  ...next[idx],
                                  ...patch
                                };
                                return next;
                              });
                            }}
                          />
                        </div>

                        {/* Row 5: Technical Specification Attributes (Key/Value Pills) */}
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase text-slate-400">
                              Technical Specification Attributes ({(item.attributes || []).length})
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const nextAttrs = [...(item.attributes || []), { key: '', value: '' }];
                                handleDraftItemChange(idx, 'attributes', nextAttrs);
                              }}
                              className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                            >
                              + Add Spec Attribute
                            </button>
                          </div>
                          {(item.attributes || []).length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {(item.attributes || []).map((attr, attrIdx) => (
                                <div key={attrIdx} className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={attr.key ?? ''}
                                    placeholder="Parameter (e.g. Dimensions, Voltage)"
                                    onChange={(e) => {
                                      const nextAttrs = [...(item.attributes || [])];
                                      nextAttrs[attrIdx] = { ...nextAttrs[attrIdx], key: e.target.value };
                                      handleDraftItemChange(idx, 'attributes', nextAttrs);
                                    }}
                                    className="w-2/5 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] font-mono"
                                  />
                                  <input
                                    type="text"
                                    value={attr.value ?? ''}
                                    placeholder="Value (e.g. 220V / 50Hz)"
                                    onChange={(e) => {
                                      const nextAttrs = [...(item.attributes || [])];
                                      nextAttrs[attrIdx] = { ...nextAttrs[attrIdx], value: e.target.value };
                                      handleDraftItemChange(idx, 'attributes', nextAttrs);
                                    }}
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] font-sans"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextAttrs = (item.attributes || []).filter((_, i) => i !== attrIdx);
                                      handleDraftItemChange(idx, 'attributes', nextAttrs);
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Multi-Component Set / BOM Editor — Rendered only when active */}
                        {Boolean(
                          item.is_composite_set ||
                            (item.sub_components && item.sub_components.length > 0)
                        ) && (
                          <div className="pt-2 border-t border-slate-100">
                            <CompositePackageEditor
                              isCompositeSet={true}
                              subComponents={item.sub_components || []}
                              packagePricingMode={item.package_pricing_mode || 'lump_sum'}
                              optionScopeNotes={item.option_scope_notes || ''}
                              parentQuantity={item.quantity || 1}
                              currency={(currentEnquiry.currency as string) || 'USD'}
                              products={products || []}
                              onChange={(patch) => {
                                setDraftLineItems((prev) => {
                                  const next = [...prev];
                                  const cur = next[idx];
                                  const nextUnitPrice =
                                    patch.unit_price !== undefined && patch.unit_price > 0
                                      ? patch.unit_price
                                      : cur.unit_price;
                                  const nextTotalPrice =
                                    patch.total_price !== undefined && patch.total_price > 0
                                      ? patch.total_price
                                      : Math.round((Number(cur.quantity) || 1) * (Number(nextUnitPrice) || 0) * 100) / 100;
                                  next[idx] = {
                                    ...cur,
                                    ...patch,
                                    unit_price: nextUnitPrice,
                                    total_price: nextTotalPrice
                                  };
                                  return next;
                                });
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : filteredLineItems && filteredLineItems.length > 0 ? (
                <div className="space-y-3">
                  {filteredLineItems.map((item, idx) => {
                    const origIdx = currentEnquiry.line_items ? currentEnquiry.line_items.indexOf(item) : idx;
                    const isExpanded = origIdx >= 0 ? !!expandedItemIndices[origIdx] : false;
                    const hasAttrs = item.attributes && item.attributes.length > 0;

                    const matchedProduct = (products || []).find(
                      (p) =>
                        (item.product_id && p.id === item.product_id) ||
                        (item.sku && p.sku && p.sku.toLowerCase() === item.sku.toLowerCase()) ||
                        (item.item_name && (p.name || '').trim().toLowerCase() === item.item_name.trim().toLowerCase())
                    );
                    const thumbUrl = item.image_url || matchedProduct?.image_url;
                    const availStock = matchedProduct ? (matchedProduct.stock_on_hand || 0) - (matchedProduct.stock_reserved || 0) : null;
                    const isLowStock = Boolean(matchedProduct?.is_inventoried) && (availStock ?? 0) <= (matchedProduct?.reorder_level || 0);
                    const sell = Number(item.unit_price) || 0;
                    const cost = Number(item.cost_price) || 0;
                    const lineMarginPct = !isMaskedForBasic && sell > 0 && cost > 0 ? ((sell - cost) / sell) * 100 : null;
                    const parsedDisplay = parseLineItemTitleAndSpec(item.item_name, item.description);
                    const isDrifted = matchedProduct ? hasCatalogDrift(item, matchedProduct, currentEnquiry.currency) : false;

                    const rawOpt = ((item as any).option_designation || item.option || '').trim();
                    const currentOpt = (!rawOpt || rawOpt === 'Default / Included') ? 'Default / Included' : rawOpt;

                    const prevItem = idx > 0 ? filteredLineItems[idx - 1] : null;
                    const prevRawOpt = prevItem ? (((prevItem as any).option_designation || prevItem.option || '').trim()) : null;
                    const prevOpt = prevItem ? ((!prevRawOpt || prevRawOpt === 'Default / Included') ? 'Default / Included' : prevRawOpt) : null;
                    const isFirstOfGroup = activeOptionTab === 'ALL' && optionAnalysis.hasMultipleOptions && (idx === 0 || currentOpt !== prevOpt);

                    return (
                      <React.Fragment key={origIdx >= 0 ? origIdx : idx}>
                        {isFirstOfGroup && (
                          <div className="flex items-center justify-between pt-3 pb-1 border-b border-slate-200">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-800">
                                {currentOpt}
                              </span>
                              {currentOpt === 'Default / Included' || currentOpt === 'Baseline / All' || currentOpt === 'Option A' || currentOpt.startsWith('Option A ') ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-mono font-semibold">
                                  Baseline Scope
                                </span>
                              ) : currentOpt.toLowerCase().includes('optional') ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-mono font-semibold">
                                  Elective Add-On (Excl. Baseline)
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-mono font-semibold">
                                  Alternative Option (Excl. Baseline)
                                </span>
                              )}
                            </div>
                            {optionAnalysis.groupMap[currentOpt] && (
                              <span className="text-xs font-mono tabular-nums font-semibold text-slate-500">
                                Subtotal: {formatCurrency(optionAnalysis.groupMap[currentOpt].total)} ({optionAnalysis.groupMap[currentOpt].count} items)
                              </span>
                            )}
                          </div>
                        )}

                        <div
                          className={`bg-slate-50 border transition-all duration-200 rounded-xl overflow-hidden ${
                            isExpanded ? 'border-blue-300 shadow-xs bg-slate-50/90' : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Collapsed Header Bar */}
                          <div
                            onClick={() => toggleLineItem(origIdx >= 0 ? origIdx : idx)}
                            className="p-3.5 flex items-center justify-between cursor-pointer select-none hover:bg-slate-100/70 transition gap-3"
                          >
                            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                              <div className="text-slate-400 hover:text-slate-600 shrink-0">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </div>

                              {thumbUrl ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxItemState({
                                      origIdx: origIdx >= 0 ? origIdx : idx,
                                      item,
                                      matchedProduct
                                    });
                                  }}
                                  className="relative group/thumb shrink-0 cursor-pointer"
                                  title="Click to zoom & inspect item photo / diagram"
                                >
                                  <img
                                    src={thumbUrl}
                                    alt={parsedDisplay.title || 'Product'}
                                    className="w-9 h-9 rounded-lg object-contain bg-white border border-slate-200 group-hover/thumb:border-blue-400 p-0.5 shrink-0 transition"
                                    style={{
                                      transform: `rotate(${(item.image_adjustments || matchedProduct?.image_adjustments)?.rotation || 0}deg) scale(${(item.image_adjustments || matchedProduct?.image_adjustments)?.scale || 1})`
                                    }}
                                    referrerPolicy="no-referrer"
                                  />
                                  {(item.secondary_image_url || matchedProduct?.secondary_image_url) && (
                                    <span className="absolute -top-1 -right-1 px-1 py-0.2 rounded-full bg-indigo-600 text-white text-[8px] font-mono font-bold shadow-xs">
                                      2
                                    </span>
                                  )}
                                </button>
                              ) : (
                                <span className="text-xs bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded font-mono font-bold shrink-0">
                                  #{origIdx >= 0 ? origIdx + 1 : idx + 1}
                                </span>
                              )}

                              {item.item_type === 'charge' || item.item_type === 'discount' || item.product_type === 'Service / Charge' ? (
                                <span className="text-xs bg-amber-50 border border-amber-200 text-amber-800 font-bold px-2 py-0.5 rounded font-mono flex items-center gap-1 shrink-0">
                                  <span>Charge:</span> {item.charge_type || item.product_type}
                                </span>
                              ) : (
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-slate-900 text-sm truncate">
                                      {parsedDisplay.title || item.product_type || 'Line Item'}
                                    </span>
                                    {matchedProduct?.is_inventoried && availStock !== null && (
                                      <span
                                        className={`text-[10px] font-mono tabular-nums font-bold px-1.5 py-0.2 rounded shrink-0 ${
                                          isLowStock
                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        }`}
                                      >
                                        Avail: {availStock} {matchedProduct.unit}
                                      </span>
                                    )}
                                    {(item.datasheet_attachment?.url || matchedProduct?.datasheet_attachment?.url) && (
                                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                                        Datasheet
                                      </span>
                                    )}
                                    {canEditEnquiry(user, activeWorkspace, currentEnquiry) && !matchedProduct && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSaveToCatalogState({
                                            isOpen: true,
                                            item,
                                            itemIndex: origIdx >= 0 ? origIdx : idx,
                                            isFromDraft: false
                                          });
                                        }}
                                        className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-0.5 cursor-pointer shrink-0"
                                        title="Register this custom line item in the Products Catalog"
                                      >
                                        <Plus className="w-2.5 h-2.5" />
                                        <span>Save to Catalog</span>
                                      </button>
                                    )}
                                    {canEditEnquiry(user, activeWorkspace, currentEnquiry) && matchedProduct && (
                                      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                                        <CatalogSyncMenu
                                          item={item}
                                          matchedProduct={matchedProduct}
                                          products={products}
                                          setProducts={setProducts}
                                          currency={currentEnquiry.currency}
                                          activeWorkspaceId={activeWorkspace?.id}
                                          triggerToast={triggerToast}
                                          compact
                                          onUpdateLineItem={async (patch) => {
                                            const targetIdx = origIdx >= 0 ? origIdx : idx;
                                            const nextItems = [...(currentEnquiry.line_items || [])];
                                            if (!nextItems[targetIdx]) return;
                                            nextItems[targetIdx] = { ...nextItems[targetIdx], ...patch };
                                            const updatedEnq = {
                                              ...currentEnquiry,
                                              line_items: nextItems,
                                              updatedAt: new Date().toISOString()
                                            };
                                            setCurrentEnquiry(updatedEnq);
                                            setDraftLineItems(nextItems);
                                            if (onUpdateEnquiry) onUpdateEnquiry(updatedEnq);
                                            if (setEnquiries) {
                                              setEnquiries((prev) =>
                                                prev.map((e) => (e.id === currentEnquiry.id ? updatedEnq : e))
                                              );
                                            }
                                            try {
                                              const stripped = stripCatalogRedundantLineItemMedia(
                                                nextItems,
                                                products || []
                                              );
                                              await safeUpdateDoc('enquiries', currentEnquiry.id, {
                                                line_items: stripped,
                                                updatedAt: updatedEnq.updatedAt
                                              });
                                              await EnquiryRepository.save(updatedEnq);
                                            } catch (err) {
                                              console.warn('Failed updating line item from CatalogSyncMenu:', err);
                                            }
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 truncate flex items-center gap-1.5">
                                    {(item.brand_make || matchedProduct?.brand_make) && (
                                      <span className="font-medium text-slate-600">{item.brand_make || matchedProduct?.brand_make}</span>
                                    )}
                                    {(item.model_part_no || matchedProduct?.model_part_no) && (
                                      <span>· {item.model_part_no || matchedProduct?.model_part_no}</span>
                                    )}
                                    {parsedDisplay.spec && parsedDisplay.spec !== parsedDisplay.title && (
                                      <span className="truncate">· {parsedDisplay.spec}</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                              {lineMarginPct !== null && (
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded hidden sm:inline-block ${
                                    lineMarginPct >= 20
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : lineMarginPct >= 0
                                      ? 'bg-amber-50 text-amber-700'
                                      : 'bg-rose-50 text-rose-700'
                                  }`}
                                  title={`Unit Cost: ${formatCurrency(cost)}`}
                                >
                                  {lineMarginPct.toFixed(0)}% Margin
                                </span>
                              )}
                              <span className="text-xs text-slate-500 hidden sm:inline-block">
                                {item.quantity} {item.unit} × {formatCurrency(item.unit_price)}
                              </span>
                              <span className="text-sm font-bold text-blue-600">
                                {formatCurrency(item.total_price)}
                              </span>
                            </div>
                          </div>

                          {/* Inline Expanded View */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 space-y-3 border-t border-slate-200/80 bg-white">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-sans pt-1">
                                <div>
                                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Quantity & Pricing</span>
                                  <span className="font-semibold text-slate-800 font-mono tabular-nums">
                                    {item.quantity} {item.unit} @ {formatCurrency(item.unit_price)} = {formatCurrency(item.total_price)}
                                  </span>
                                </div>
                                {!isMaskedForBasic && cost > 0 && (
                                  <div>
                                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Cost & Line Margin</span>
                                    <span className="font-semibold text-slate-700 font-mono tabular-nums">
                                      Cost: {formatCurrency(cost)} ({lineMarginPct !== null ? `${lineMarginPct.toFixed(1)}%` : '—'})
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Delivery / Lead Time</span>
                                  <span className="font-semibold text-slate-700 font-mono">
                                    {item.lead_time_note || matchedProduct?.default_availability || 'Immediate / Stock'}
                                  </span>
                                </div>
                              </div>

                              {(item.brand_make || item.model_part_no || item.country_of_origin || item.hs_code) && (
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-600 pt-1">
                                  {item.brand_make && <span><strong>Brand:</strong> {item.brand_make}</span>}
                                  {item.model_part_no && <span>· <strong>Model:</strong> {item.model_part_no}</span>}
                                  {item.country_of_origin && <span>· <strong>Origin:</strong> {item.country_of_origin}</span>}
                                  {item.hs_code && <span>· <strong>HS:</strong> {item.hs_code}</span>}
                                </div>
                              )}

                              {(parsedDisplay.spec || item.description) && (
                                <div>
                                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Description / Spec Notes</span>
                                  <p className="text-xs text-slate-700 leading-relaxed font-sans font-medium whitespace-pre-line bg-slate-50 p-3 rounded-lg border border-slate-150">
                                    {parsedDisplay.spec || item.description}
                                  </p>
                                </div>
                              )}

                              {hasAttrs && (
                                <div>
                                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Specification Attributes</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {item.attributes!.map((attr, attrIdx) => (
                                      <span key={attrIdx} className="text-[11px] font-mono bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-md shadow-2xs">
                                        <span className="font-semibold text-slate-900">{attr.key}:</span> {attr.value || '—'}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {Array.isArray(item.sub_components) && item.sub_components.length > 0 && (
                                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-[10px] font-mono font-bold text-indigo-700 uppercase tracking-wider">
                                      Included Items &amp; Package Contents ({item.sub_components.length} {item.sub_components.length === 1 ? 'item' : 'items'})
                                    </span>
                                  </div>
                                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                                    <table className="w-full text-left border-collapse text-xs">
                                      <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                                          <th className="py-1.5 px-2 w-10 text-center">#</th>
                                          <th className="py-1.5 px-2">Included Item / Sub-Component</th>
                                          <th className="py-1.5 px-2 w-16 text-center">Qty</th>
                                          <th className="py-1.5 px-2 w-16 text-center">UOM</th>
                                          <th className="py-1.5 px-2 w-28 text-right">Unit Price</th>
                                          <th className="py-1.5 px-2 w-28 text-right">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {item.sub_components.map((sub, sIdx) => {
                                          const isIncludedSub = Boolean(sub.is_included_accessory) || !(Number(sub.unit_price) > 0);
                                          return (
                                            <tr key={sub.id || sIdx} className={isIncludedSub ? 'bg-slate-50/60 text-slate-600' : 'bg-white'}>
                                              <td className="py-1.5 px-2 text-center font-mono text-[11px] text-slate-400">
                                                {idx + 1}.{sIdx + 1}
                                              </td>
                                              <td className="py-1.5 px-2">
                                                <div className="font-medium text-slate-800">{sub.item_name}</div>
                                                {sub.remark && (
                                                  <div className="text-[11px] font-bold text-slate-600">
                                                    Remark: {sub.remark}
                                                  </div>
                                                )}
                                              </td>
                                              <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-800">
                                                {sub.quantity}
                                              </td>
                                              <td className="py-1.5 px-2 text-center font-mono text-slate-600 uppercase">
                                                {sub.unit || 'NOS'}
                                              </td>
                                              <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                                                {isIncludedSub ? '—' : formatCurrency(sub.unit_price)}
                                              </td>
                                              <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">
                                                {isIncludedSub ? (
                                                  <span className="text-[10px] font-semibold text-emerald-700">Included</span>
                                                ) : (
                                                  formatCurrency(sub.total_price)
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                  {item.option_scope_notes && (
                                    <div className="p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100 text-xs text-slate-700 whitespace-pre-line">
                                      <span className="font-bold text-indigo-950 block mb-0.5">Package / Scope Note:</span>
                                      {item.option_scope_notes}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 font-sans text-sm space-y-2">
                  <p>
                    {currentEnquiry.line_items && currentEnquiry.line_items.length > 0
                      ? `No line items declared under "${activeOptionTab}".`
                      : 'This enquiry does not have any declared line items yet.'}
                  </p>
                  {canEditEnquiry(user, activeWorkspace, currentEnquiry) && (
                    <button
                      type="button"
                      onClick={() => setShowQuickCatalogPicker(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>+ Pick Items from Catalog</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (() => {
            const HIDDEN_AUDIT_FIELDS = new Set([
              'id',
              '_id',
              'updated_at',
              'updatedat',
              'created_at',
              'createdat',
              'version',
              'sync_status',
              'workspace_id',
              'workspaceid',
              'createdby',
              'created_by',
              'created_by_uid',
              'createdbyuid',
              'created_by_name',
              'createdbyusername',
              'last_modified_by_uid',
              'last_modified_by_name',
              'updatedbyuid',
              'updatedbyusername',
              'assigned_to_id',
              'sales_person_id',
              'salesperson_id',
              'statusupdatedat',
              'statusupdatedby',
              'statushistory'
            ]);

            const CANONICAL_AUDIT_FIELD_MAP: Record<string, string> = {
              salesperson: 'salesperson',
              sales_person: 'salesperson',
              assigned_salesperson: 'salesperson',
              assignedsalesperson: 'salesperson',
              assigned_to: 'salesperson',
              quote_ref_no: 'quote_ref_no',
              latest_quote_ref: 'quote_ref_no',
              value_aed: 'value_aed',
              quoted_amount: 'value_aed',
              raw_source_text: 'raw_source_text',
              projected_order_date: 'projected_order_date',
              line_items: 'line_items',
              company_name: 'company_name',
              project_location: 'project_location',
              concerned_person: 'concerned_person',
              concerned_persons: 'concerned_person',
              contact_person_name: 'concerned_person'
            };

            const BUSINESS_FIELD_LABELS: Record<string, string> = {
              salesperson: 'Salesperson',
              quote_ref_no: 'Quote Ref No.',
              value_aed: 'Package Value (AED)',
              raw_source_text: 'Source Text',
              projected_order_date: 'Est. Order Date',
              line_items: 'Line Items',
              company_name: 'Company Name',
              project_location: 'Project Location',
              concerned_person: 'Contact Person',
              client_reference: 'Client Reference',
              enquiry_date: 'Proposal Date',
              status: 'Status',
              remarks: 'Remarks & Notes',
              subject: 'Subject',
              currency: 'Currency',
              payment_terms: 'Payment Terms',
              delivery_terms: 'Delivery Terms',
              validity_days: 'Validity (Days)',
              proposal_option: 'Confirmed Option',
              quotation_acceptance: 'Quotation Accepted',
              quotation_declined: 'Quotation Declined',
              version_rollback: 'Version Rollback',
              attachments: 'Attachments'
            };

            const isEmptyAuditVal = (v: any): boolean => {
              if (v === null || v === undefined || v === '') return true;
              if (Array.isArray(v) && v.length === 0) return true;
              return false;
            };

            const formatAuditVal = (fieldKey: string, val: any): string => {
              if (isEmptyAuditVal(val)) return 'None';
              if (fieldKey === 'line_items' && Array.isArray(val)) {
                return `${val.length} item${val.length === 1 ? '' : 's'}`;
              }
              if (fieldKey === 'attachments' && Array.isArray(val)) {
                return `${val.length} file${val.length === 1 ? '' : 's'}`;
              }
              if (typeof val === 'object') {
                if (Array.isArray(val)) {
                  return val.map((x) => (typeof x === 'object' ? (x?.name || x?.item_name || JSON.stringify(x)) : String(x))).join(', ');
                }
                return JSON.stringify(val);
              }
              return String(val);
            };

            return (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono border-b border-slate-100 pb-2 mb-2">
                  <History className="w-4 h-4" />
                  <span>Enquiry Revision Registry & Audit trail</span>
                </div>

                {recordLogs.length > 0 ? (
                  <div className="space-y-4">
                    {recordLogs.map((log) => {
                      const seenCanonical = new Set<string>();
                      const businessChanges = (log.changes || []).filter((diff) => {
                        const rawField = String(diff.field || '').trim();
                        const lowerField = rawField.toLowerCase();
                        if (!rawField || HIDDEN_AUDIT_FIELDS.has(lowerField)) return false;
                        if (isEmptyAuditVal(diff.old_value) && isEmptyAuditVal(diff.new_value)) return false;
                        const canonical = CANONICAL_AUDIT_FIELD_MAP[lowerField] || lowerField;
                        if (seenCanonical.has(canonical)) return false;
                        seenCanonical.add(canonical);
                        const formattedOld = formatAuditVal(canonical, diff.old_value);
                        const formattedNew = formatAuditVal(canonical, diff.new_value);
                        if (formattedOld === formattedNew) return false;
                        return true;
                      });

                      return (
                        <div key={log.id} className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-150 pb-2.5">
                            <div className="space-y-0.5">
                              <span className="text-xs text-slate-800 font-semibold block font-sans">
                                {log.changed_by_name}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono block">
                                {new Date(log.timestamp).toLocaleString()}
                              </span>
                            </div>

                            {user.role !== 'Viewer' && (
                              <button
                                type="button"
                                onClick={() => handleRevert(log)}
                                disabled={reverting}
                                className="py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold font-sans transition flex items-center space-x-1.5 shadow-sm"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Rollback</span>
                              </button>
                            )}
                          </div>

                          {businessChanges.length > 0 ? (
                            <div className="space-y-2">
                              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Modified properties:</span>
                              {businessChanges.map((diff, idx) => {
                                const lowerField = String(diff.field || '').toLowerCase();
                                const canonical = CANONICAL_AUDIT_FIELD_MAP[lowerField] || lowerField;
                                const label =
                                  BUSINESS_FIELD_LABELS[canonical] ||
                                  String(diff.field)
                                    .replace(/_/g, ' ')
                                    .replace(/\b\w/g, (c) => c.toUpperCase());
                                return (
                                  <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1 font-sans">
                                    <span className="text-blue-600 font-semibold block">{label}</span>
                                    <div className="flex flex-col space-y-0.5 text-[11px] text-slate-500 pl-2 border-l border-slate-100 font-mono">
                                      <span className="line-through text-slate-400 break-words">
                                        Was: {formatAuditVal(canonical, diff.old_value)}
                                      </span>
                                      <span className="text-emerald-600 font-semibold break-words">
                                        Is: {formatAuditVal(canonical, diff.new_value)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-xs font-mono text-slate-400 italic block">
                              {log.details || 'Record updated'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400 font-sans text-sm">
                    This enquiry does not have any revision history records yet.
                  </div>
                )}
              </div>
            );
          })()}

          {activeTab === 'revisions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center space-x-2 text-xs text-slate-500 font-mono">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold uppercase tracking-wider text-slate-700">
                    Commercial Documents Hub ({unifiedHubDocuments.length})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {canEditEnquiry(user, activeWorkspace, currentEnquiry) && (
                    <button
                      type="button"
                      onClick={handleCreateRevision}
                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1"
                    >
                      <GitFork className="w-3.5 h-3.5" />
                      <span>Create Revision</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingQuotation(getPrimarySourceQuotation());
                      setIsQuotationStudioOpen(true);
                    }}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Open Quotation Studio</span>
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 px-3 font-bold">Type</th>
                        <th className="py-2.5 px-3 font-bold">Reference Code</th>
                        <th className="py-2.5 px-3 font-bold">Rev #</th>
                        <th className="py-2.5 px-3 font-bold">Created Date</th>
                        <th className="py-2.5 px-3 font-bold text-right">Total Amount</th>
                        <th className="py-2.5 px-3 font-bold">Status</th>
                        <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {unifiedHubDocuments.map((q) => {
                        const docType = q.document_type || 'quotation';
                        const isQuoteDoc = docType === 'quotation';
                        const isBaselineVirtual = Boolean((q as any)._isBaselineEnquiryProposal);
                        const isSuperseded = q.status === 'Superseded';
                        const isApproved = q.status === 'Approved';
                        const isDeclined = q.status === 'Declined';
                        const isSent = q.status === 'Sent';

                        const badgeLabel =
                          docType === 'delivery_note'
                            ? 'DO'
                            : docType === 'purchase_order'
                            ? 'PO'
                            : docType === 'receipt'
                            ? 'REC'
                            : docType === 'payment_voucher'
                            ? 'PV'
                            : docType === 'material_return_note'
                            ? 'MRN'
                            : docType === 'debit_note'
                            ? 'DN'
                            : 'QT';

                        return (
                          <tr key={q.id || q.formatted_quote_ref} className="hover:bg-slate-50/90 transition">
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded border text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border-indigo-200">
                                {badgeLabel}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              {q.formatted_quote_ref}
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {isQuoteDoc ? `R${q.revision_number || 1}` : '—'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                              {q.created_at
                                ? new Date(q.created_at).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric'
                                  })
                                : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                              {docType === 'delivery_note' || docType === 'material_return_note'
                                ? `Unpriced • ${(q.line_items || []).length} item(s)`
                                : `${q.currency || 'AED'} ${Number(q.grand_total || 0).toLocaleString('en-US', {
                                    minimumFractionDigits: 2
                                  })}`}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                                  isApproved
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : isDeclined
                                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                                    : isSuperseded
                                    ? 'bg-slate-100 text-slate-500 border-slate-200'
                                    : isSent
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                {q.status || 'Draft'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingQuotation(isBaselineVirtual ? resolvePrimarySavedQuotation() : q);
                                    setIsQuotationStudioOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                                >
                                  Open in Studio
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleOutsideQuickPrint(q);
                                  }}
                                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1"
                                >
                                  <Printer className="w-3 h-3 text-slate-500" />
                                  <span>Print</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Custom Confirmation Dialog Overlay */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 font-sans mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 font-sans mb-4">{confirmDialog.message}</p>
            {confirmDialog.selectableOptions && confirmDialog.selectableOptions.length > 1 && (
              <div className="mb-5 p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                <label className="block text-[11px] font-bold text-indigo-900 uppercase tracking-wider">
                  Select Confirmed Winning Option
                </label>
                <div className="flex flex-wrap gap-2">
                  {confirmDialog.selectableOptions.map((opt) => {
                    const isSelected = confirmDialog.selectedOption === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          setConfirmDialog((prev) => ({ ...prev, selectedOption: opt }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center justify-end space-x-3 font-sans">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                {confirmDialog.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm(confirmDialog.selectedOption);
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                }}
                className={`py-2 px-4 rounded-xl text-xs font-bold text-white transition cursor-pointer ${
                  confirmDialog.variant === 'success'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : confirmDialog.variant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : confirmDialog.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Attachment Preview Modal */}
      <FilePreviewModal
        isOpen={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        file={previewAttachment}
        onDownload={handleDownloadAttachment}
      />

      {/* Collaborators & Access Sharing Modal */}
      <EnquiryCollaboratorsModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        enquiry={currentEnquiry}
        salespersons={salespersons}
        canManage={canManageSharing}
        onToggleCollaborator={handleToggleCollaborator}
        isCollaboratorCheck={(sp) => isMemberCollaborator(sp, currentEnquiry)}
        workspaceId={currentEnquiry.workspace_id || activeWorkspaceId}
      />

      {/* Operational Handoff & Project Conversion Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-900 dark:text-white">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Project Conversion & Operational Handoff
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Instantiating fulfillment container for {currentEnquiry.quote_ref_no || currentEnquiry.id} • {currentEnquiry.company_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConvertModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs font-sans">
              {/* Project Type Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Operational Project Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectProjectType('Supply Only')}
                    className={`p-3.5 rounded-xl border text-left transition flex items-start space-x-3 cursor-pointer ${
                      convertProjectType === 'Supply Only'
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`p-2 rounded-lg mt-0.5 ${
                      convertProjectType === 'Supply Only'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center space-x-1.5">
                        <span>Supply Only</span>
                        {convertProjectType === 'Supply Only' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Warehouse picking, staging, and outbound dispatch. Suitable for hardware or equipment trade.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectProjectType('Turnkey / Installation')}
                    className={`p-3.5 rounded-xl border text-left transition flex items-start space-x-3 cursor-pointer ${
                      convertProjectType === 'Turnkey / Installation'
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`p-2 rounded-lg mt-0.5 ${
                      convertProjectType === 'Turnkey / Installation'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center space-x-1.5">
                        <span>Turnkey / Installation</span>
                        {convertProjectType === 'Turnkey / Installation' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Full site delivery, mechanical/electrical installation, wet commissioning, and client signoff (TOC).
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Two-Column Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Assigned Project Lead / Engineer
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={convertEngineerName}
                      onChange={(e) => setConvertEngineerName(e.target.value)}
                      placeholder="e.g. Eng. Sarah Mitchell"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Target Delivery / Commissioning Date
                  </label>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="date"
                      value={convertTargetDate}
                      onChange={(e) => setConvertTargetDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Site / Delivery Location
                  </label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={convertSiteLocation}
                      onChange={(e) => setConvertSiteLocation(e.target.value)}
                      placeholder="e.g. Plot 42, Dubai Industrial City / Client Warehouse"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Operational Handover Notes
                  </label>
                  <textarea
                    rows={2}
                    value={convertOperationalNotes}
                    onChange={(e) => setConvertOperationalNotes(e.target.value)}
                    placeholder="Special instructions for operations, warehouse, or site technicians..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                  />
                </div>
              </div>

              {/* Milestone Pipeline Editable Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Milestone Pipeline & Operational Phases ({modalMilestones.length} Phases)
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Customizable • Initial status: {modalMilestones[0]?.status || 'In Progress'}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                  {modalMilestones.map((ms, idx) => (
                    <div
                      key={ms.id || idx}
                      className="flex items-center space-x-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-2xs"
                    >
                      <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={ms.title}
                        onChange={(e) => handleUpdateMilestoneTitle(ms.id, e.target.value)}
                        placeholder="Phase title..."
                        className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans font-medium"
                      />
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium shrink-0 ${
                        idx === 0
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {ms.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMilestone(ms.id)}
                        disabled={modalMilestones.length <= 1}
                        title={modalMilestones.length <= 1 ? 'At least one milestone is required' : 'Remove Milestone'}
                        className="p-1.5 text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 disabled:opacity-30 disabled:hover:text-rose-500 rounded-lg transition cursor-pointer disabled:cursor-not-allowed shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={handleAddMilestone}
                    className="w-full py-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 hover:border-slate-400 dark:hover:text-slate-300 flex items-center justify-center space-x-1.5 transition cursor-pointer"
                  >
                    <span>+ Add Custom Phase / Milestone</span>
                  </button>
                </div>
              </div>

              {/* Winning Option Selector for Multi-Option Enquiries */}
              {optionAnalysis.hasMultipleOptions && (() => {
                const selectableOptions = optionAnalysis.detectedOptions.filter(
                  (opt) => opt !== 'Default / Included' && opt !== 'Baseline / All'
                );
                if (selectableOptions.length === 0) return null;
                return (
                  <div className="bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
                        Confirmed Winning Option for Fulfillment
                      </label>
                      <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-300">
                        Includes Default / Baseline items automatically
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectableOptions.map((opt) => {
                        const isSelected = convertSelectedOption === opt;
                        const optGroup = optionAnalysis.groupMap[opt];
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setConvertSelectedOption(opt)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer border ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                            }`}
                          >
                            <span>{opt}</span>
                            {optGroup && (
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                  isSelected
                                    ? 'bg-indigo-700 text-indigo-100'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                                }`}
                              >
                                {optGroup.count} item{optGroup.count === 1 ? '' : 's'} • {formatCurrency(optGroup.total)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Line Item Scope Summary */}
              {(() => {
                const allItems = currentEnquiry.line_items || [];
                const scopedItems = optionAnalysis.hasMultipleOptions
                  ? allItems.filter((item) => {
                      const rawOpt = ((item as any).option_designation || item.option || '').trim();
                      if (!rawOpt || rawOpt === 'Default / Included' || rawOpt === 'Baseline / All') return true;
                      return rawOpt.toLowerCase() === (convertSelectedOption || 'Option A').toLowerCase();
                    })
                  : allItems;
                const scopedContractValue = optionAnalysis.hasMultipleOptions
                  ? scopedItems.reduce((sum, it) => {
                      const isDisc = it.item_type === 'discount' || (it as any).classification === 'Discount / Rebate';
                      const lineTot = Number(it.total_price) || (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
                      return sum + (isDisc ? -Math.abs(lineTot) : lineTot);
                    }, 0)
                  : currentEnquiry.value_aed;

                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Scope of Line Items ({scopedItems.length})
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Contract Value: {formatCurrency(scopedContractValue)}
                      </span>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] font-mono text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-2 px-3">#</th>
                            <th className="py-2 px-3">Description</th>
                            <th className="py-2 px-3 text-right">Qty</th>
                            <th className="py-2 px-3 text-center">Inventory Type</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {scopedItems.length > 0 ? (
                            scopedItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">
                                  {idx + 1}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                                    {item.item_name || item.description || 'Line Item'}
                                  </div>
                                  {item.item_name && item.description && item.description !== item.item_name && (
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                      {item.description}
                                    </div>
                                  )}
                                  {item.product_type && (
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      {item.product_type}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                  {item.quantity || 1} {item.unit || 'EA'}
                                </td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  {item.product_id || (item.is_composite_set && Array.isArray(item.sub_components) && item.sub_components.some((sc) => sc.product_id)) ? (
                                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                      <Package className="w-3 h-3 text-emerald-600" />
                                      <span>Catalog Stock</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                                      <Wrench className="w-3 h-3 text-slate-400" />
                                      <span>Custom / Scope</span>
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="py-3 px-3 text-center text-slate-400 italic text-[11px]">
                                No line items registered for this option.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowConvertModal(false)}
                disabled={isCreatingProject}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateProject}
                disabled={isCreatingProject}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center space-x-2 cursor-pointer disabled:opacity-60"
              >
                {isCreatingProject ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Launching Project...</span>
                  </>
                ) : (
                  <>
                    <FolderPlus className="w-4 h-4" />
                    <span>Confirm & Launch Project</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quotation Studio Drawer / Modal */}
      {isQuotationStudioOpen && (() => {
        const spName = studioSpName;

        return (
          <QuotationStudioModal
            isOpen={isQuotationStudioOpen}
            onClose={() => {
              setIsQuotationStudioOpen(false);
              setEditingQuotation(null);
            }}
            enquiry={enrichedEnquiry}
            salespersonName={spName || resolveSalespersonName(currentEnquiry)}
            activeWorkspaceId={currentEnquiry.workspace_id || activeWorkspaceId || 'ws_default'}
            activeWorkspace={activeWorkspace}
            user={user}
            profile={documentProfile}
            editingQuotation={editingQuotation}
            products={products}
            setProducts={setProducts}
            companies={companies}
            contacts={contacts}
            supplierBills={workspaceSupplierBills}
            onEnquirySync={(syncPayload) => {
              const sanitizedRef = QuotationRepository.sanitizeCanonicalQuoteRef(syncPayload.latest_quote_ref);
              if (!sanitizedRef) return;
              const hydratedSyncedItems =
                Array.isArray(syncPayload.line_items) && syncPayload.line_items.length > 0
                  ? rehydrateLineItemsFromCatalog(syncPayload.line_items, products)
                  : undefined;

              const buildPatchedEnquiry = (base: Enquiry): Enquiry => ({
                ...base,
                active_quotation_id: syncPayload.active_quotation_id,
                latest_quote_ref: sanitizedRef,
                quote_ref_no: sanitizedRef,
                quoted_amount: syncPayload.quoted_amount,
                value_aed: syncPayload.quoted_amount,
                quotation_status: syncPayload.quotation_status,
                latest_revision_number: syncPayload.latest_revision_number,
                ...(hydratedSyncedItems ? { line_items: hydratedSyncedItems } : {}),
                ...(syncPayload.subject ? { subject: syncPayload.subject } : {}),
                ...(syncPayload.validity_days !== undefined ? { validity_days: syncPayload.validity_days } : {}),
                ...(syncPayload.valid_until ? { valid_until: syncPayload.valid_until } : {}),
                ...(syncPayload.price_basis ? { price_basis: syncPayload.price_basis } : {}),
                ...(syncPayload.delivery_period ? { delivery_period: syncPayload.delivery_period } : {}),
                ...(syncPayload.payment_terms ? { payment_terms: syncPayload.payment_terms } : {}),
                ...(syncPayload.tax_mode ? { tax_mode: syncPayload.tax_mode } : {})
              });

              if (hydratedSyncedItems) {
                setDraftLineItems(hydratedSyncedItems);
              }
              setCurrentEnquiry((prev) => (prev ? buildPatchedEnquiry(prev) : prev));
              const patchedCurrent = buildPatchedEnquiry(currentEnquiry);
              if (onUpdateEnquiry) {
                onUpdateEnquiry(patchedCurrent);
              }
              if (setEnquiries) {
                setEnquiries((prev) =>
                  prev.map((e) => (e.id === patchedCurrent.id ? patchedCurrent : e))
                );
              }
            }}
            onQuotationCreated={async (newQuote) => {
              const isStandardQuotation =
                (newQuote.document_type || 'quotation') === 'quotation' &&
                !/^(?:DO|PO|REC|PV|MRN|DN)-/i.test(newQuote.formatted_quote_ref || '');

              setQuotations((prev) => {
                const combined = [newQuote, ...prev.filter((q) => q.id !== newQuote.id)];
                const parentId = newQuote.parent_quotation_id || newQuote.parent_quote_id;
                if (isStandardQuotation && (parentId || combined.length > 1)) {
                  return QuotationRepository.markPreviousRevisionsSuperseded(combined, newQuote.id!);
                }
                return combined;
              });

              // Deal Value & Bi-Directional Line Item / Commercial Sync for standard Quotations
              if (isStandardQuotation && currentEnquiry?.id) {
                const syncPayload = QuotationRepository.buildEnquiryQuotationSyncPayload(newQuote);
                const newTotal = syncPayload.quoted_amount;
                const newRef = QuotationRepository.sanitizeCanonicalQuoteRef(newQuote.formatted_quote_ref);
                const hydratedSyncedItems =
                  Array.isArray(syncPayload.line_items) && syncPayload.line_items.length > 0
                    ? rehydrateLineItemsFromCatalog(syncPayload.line_items, products)
                    : undefined;
                try {
                  if (hydratedSyncedItems) {
                    setDraftLineItems(hydratedSyncedItems);
                  }
                  const buildPatched = (base: Enquiry): Enquiry => ({
                    ...base,
                    value_aed: newTotal,
                    quoted_amount: newTotal,
                    quote_ref_no: newRef,
                    latest_quote_ref: newRef,
                    active_quotation_id: newQuote.id,
                    quotation_status: newQuote.status || 'Draft',
                    latest_revision_number: newQuote.revision_number ?? 1,
                    ...(hydratedSyncedItems ? { line_items: hydratedSyncedItems } : {}),
                    ...(syncPayload.subject ? { subject: syncPayload.subject } : {}),
                    ...(syncPayload.validity_days !== undefined ? { validity_days: syncPayload.validity_days } : {}),
                    ...(syncPayload.valid_until ? { valid_until: syncPayload.valid_until } : {}),
                    ...(syncPayload.price_basis ? { price_basis: syncPayload.price_basis } : {}),
                    ...(syncPayload.delivery_period ? { delivery_period: syncPayload.delivery_period } : {}),
                    ...(syncPayload.payment_terms ? { payment_terms: syncPayload.payment_terms } : {}),
                    ...(syncPayload.tax_mode ? { tax_mode: syncPayload.tax_mode } : {})
                  });
                  setCurrentEnquiry((prev) => (prev ? buildPatched(prev) : prev));
                  const nextEnq = buildPatched(currentEnquiry);
                  if (onUpdateEnquiry) {
                    onUpdateEnquiry(nextEnq);
                  }
                  if (setEnquiries) {
                    setEnquiries((prev) => prev.map((e) => (e.id === nextEnq.id ? nextEnq : e)));
                  }
                } catch (valErr) {
                  console.warn('[EnquiryDetail] Failed updating enquiry deal value from quotation:', valErr);
                }
              }

              if (newQuote.status === 'Sent') {
                if (isStandardQuotation) {
                  handleStatusTransition('Sent / Pending Client');

                  // If new revision has a parent quotation, ensure predecessor is updated to Superseded
                  const parentId = newQuote.parent_quotation_id || newQuote.parent_quote_id;
                  if (parentId) {
                    try {
                      await QuotationRepository.updateQuotation(parentId, {
                        status: 'Superseded',
                        superseded_by_id: newQuote.id
                      });
                      setQuotations((prev) =>
                        prev.map((q) =>
                          q.id === parentId
                            ? { ...q, status: 'Superseded' as const, superseded_by_id: newQuote.id }
                            : q
                        )
                      );
                    } catch (supErr) {
                      console.warn('[EnquiryDetail] Failed superseding predecessor quotation:', supErr);
                    }
                  }
                }

                // 1. Append immutable activity log entry for the issued commercial document
                try {
                  const activityId = `act_doc_${Date.now()}`;
                  const wsId = currentEnquiry.workspace_id || activeWorkspaceId || 'ws_default';
                  const docTypeLabel =
                    newQuote.document_type === 'delivery_note'
                      ? 'Delivery Note'
                      : newQuote.document_type === 'purchase_order'
                      ? 'Purchase Order'
                      : newQuote.document_type === 'receipt'
                      ? 'Payment Receipt'
                      : 'Formal Commercial Offer';
                  const formattedVal = `${newQuote.currency || 'AED'} ${Number(newQuote.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

                  await ActivityLogRepository.save({
                    id: activityId,
                    workspace_id: wsId,
                    company_id: currentEnquiry.company_id || '',
                    contact_id: currentEnquiry.contact_id || '',
                    enquiry_id: currentEnquiry.id || '',
                    enquiry_quote_ref: newQuote.formatted_quote_ref,
                    channel: 'Email',
                    status: 'Completed',
                    outcome: 'Enquiry Received',
                    notes:
                      newQuote.document_type === 'delivery_note'
                        ? `${docTypeLabel} Issued: ${newQuote.formatted_quote_ref} (${(newQuote.line_items || []).length} items)`
                        : `${docTypeLabel} Issued: ${newQuote.formatted_quote_ref} (Value: ${formattedVal})`,
                    logged_by: user?.full_name || user?.username || 'User',
                    date: new Date().toISOString()
                  });
                } catch (actErr) {
                  console.warn('[EnquiryDetail] Failed creating activity log for issued document:', actErr);
                }

                // 2. Register document / attachment reference on the enquiry record
                try {
                  if (currentEnquiry?.id) {
                    const newDocAttachment: Attachment = {
                      name: `${newQuote.formatted_quote_ref}.pdf`,
                      size: 0,
                      type: 'application/pdf',
                      url: `quotations/${newQuote.formatted_quote_ref}.pdf`,
                      storageProvider: 'local',
                      uploadedAt: new Date().toISOString(),
                      uploadedByUserName: user?.full_name || user?.username || 'System'
                    };

                    const existingAttachments = currentEnquiry.attachments || [];
                    const updatedAttachments = [
                      ...existingAttachments.filter(
                        (a) => a.name !== newDocAttachment.name
                      ),
                      newDocAttachment
                    ];

                    await safeUpdateDoc('enquiries', currentEnquiry.id, {
                      attachments: updatedAttachments,
                      updated_at: new Date().toISOString()
                    });

                    setCurrentEnquiry((prev) =>
                      prev ? { ...prev, attachments: updatedAttachments } : prev
                    );

                    if (onUpdateEnquiry) {
                      onUpdateEnquiry({ ...currentEnquiry, attachments: updatedAttachments });
                    }
                  }
                } catch (attErr) {
                  console.warn('[EnquiryDetail] Failed registering quotation document attachment:', attErr);
                }
              }
            }}
            triggerToast={triggerToast}
          />
        );
      })()}

      {/* Supplier Purchase Order (PO) Builder Modal */}
      {poModalState.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Generate Purchase Order (PO)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Select supplier, PO mode, and line items to include
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPoModalState((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {/* PO Mode Selector */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                {[
                  {
                    id: 'supplier_po' as const,
                    title: 'Outbound Supplier PO',
                    desc: 'Uses unit cost prices (hides client sell rate)'
                  },
                  {
                    id: 'order_acknowledgment' as const,
                    title: 'Order Acknowledgment',
                    desc: 'Confirms client order with agreed rates'
                  }
                ].map((opt) => {
                  const isSel = poModalState.poVariant === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPoModalState((prev) => ({ ...prev, poVariant: opt.id }))}
                      className={`p-2.5 rounded-lg text-left transition cursor-pointer ${
                        isSel
                          ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className="font-bold block text-xs">{opt.title}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Select Supplier from Companies Directory */}
              <div>
                <FieldLabel label="Select from Companies Directory (Optional)" />
                <select
                  value={poModalState.supplierCompanyId}
                  onChange={(e) => {
                    const compId = e.target.value;
                    const found = companies.find((c) => c.id === compId);
                    if (found) {
                      const primaryContact = contacts.find((ct) => ct.company_id === found.id);
                      setPoModalState((prev) => ({
                        ...prev,
                        supplierCompanyId: compId,
                        supplierName: found.display_name || found.canonical_name || '',
                        supplierContact: primaryContact?.full_name || '',
                        supplierEmail: primaryContact?.email || found.email || '',
                        supplierPhone: primaryContact?.phone || found.phone || '',
                        supplierAddress: [(found as any).address, found.city, found.country]
                          .filter(Boolean)
                          .join(', '),
                        supplierTrn: (found as any).trn || ''
                      }));
                    } else {
                      setPoModalState((prev) => ({ ...prev, supplierCompanyId: '' }));
                    }
                  }}
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 py-1.5 bg-white text-slate-800 text-xs leading-normal"
                >
                  <option value="">-- Enter Custom Supplier or Pick Company --</option>
                  {companies
                    .filter((c) => !c.is_deleted)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display_name} {c.city ? `(${c.city})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
                <div>
                  <FieldLabel label="Supplier / Vendor Name" required />
                  <input
                    type="text"
                    value={poModalState.supplierName}
                    onChange={(e) =>
                      setPoModalState((prev) => ({ ...prev, supplierName: e.target.value }))
                    }
                    placeholder="Vendor Legal Name"
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 text-xs leading-normal"
                  />
                </div>
                <div>
                  <FieldLabel label="Contact Person" />
                  <input
                    type="text"
                    value={poModalState.supplierContact}
                    onChange={(e) =>
                      setPoModalState((prev) => ({ ...prev, supplierContact: e.target.value }))
                    }
                    placeholder="Account Representative"
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 text-xs leading-normal"
                  />
                </div>
                <div>
                  <FieldLabel label="Shipping Destination" />
                  <select
                    value={poModalState.shippingDestination}
                    onChange={(e) =>
                      setPoModalState((prev) => ({
                        ...prev,
                        shippingDestination: e.target.value as any
                      }))
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 py-1.5 bg-white text-slate-800 text-xs leading-normal"
                  >
                    <option value="Warehouse">Our Warehouse / Facility</option>
                    <option value="Direct to Client Site">Direct to Client Site</option>
                    <option value="Custom">Custom Address</option>
                  </select>
                </div>
                <div>
                  <FieldLabel label="Incoterms" />
                  <select
                    value={poModalState.incoterms}
                    onChange={(e) =>
                      setPoModalState((prev) => ({
                        ...prev,
                        incoterms: e.target.value as any
                      }))
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 py-1.5 bg-white text-slate-800 text-xs leading-normal"
                  >
                    <option value="Ex-Works">Ex-Works</option>
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                    <option value="DDP">DDP (Delivered Duty Paid)</option>
                    <option value="DAP">DAP (Delivered at Place)</option>
                  </select>
                </div>
              </div>

              {/* Select Line Items to Include */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    Select Line Items for this PO
                  </span>
                  <span className="text-[11px] font-mono text-indigo-600 font-semibold">
                    {poModalState.selectedItemIndices.length} selected
                  </span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {buildBaseLineItemsFromSource(poModalState.sourceQuote).map((it, idx) => {
                    const isChecked = poModalState.selectedItemIndices.includes(idx);
                    const matchedProd = products.find(
                      (p) =>
                        (it.product_id && p.id === it.product_id) ||
                        (it.sku && p.sku && p.sku.toLowerCase() === it.sku.toLowerCase()) ||
                        (it.item_name &&
                          (p.name || p.description || '').trim().toLowerCase() ===
                            it.item_name.trim().toLowerCase())
                    );
                    const unitCost =
                      it.cost_price !== undefined && it.cost_price !== null && Number(it.cost_price) > 0
                        ? Number(it.cost_price)
                        : matchedProd?.cost_price !== undefined && matchedProd?.cost_price !== null
                        ? Number(matchedProd.cost_price)
                        : 0;
                    // Multi-Vendor Split Indicator: check if this line item was already ordered on an existing Supplier PO
                    const orderedOnPoRefs = quotations
                      .filter(
                        (q) =>
                          !q.is_deleted &&
                          q.document_type === 'purchase_order' &&
                          q.purchase_order_metadata?.po_variant !== 'order_acknowledgment' &&
                          (q.line_items || []).some(
                            (pli) =>
                              (it.id && pli.id === it.id) ||
                              (it.product_id && pli.product_id === it.product_id) ||
                              (it.item_name &&
                                pli.item_name &&
                                pli.item_name.trim().toLowerCase() ===
                                  it.item_name.trim().toLowerCase())
                          )
                      )
                      .map((q) => q.purchase_order_metadata?.po_ref || q.formatted_quote_ref);

                    return (
                      <label
                        key={it.id || idx}
                        className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border cursor-pointer transition ${
                          isChecked
                            ? 'bg-indigo-50/60 border-indigo-200'
                            : 'bg-white border-slate-200 opacity-65'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              setPoModalState((prev) => ({
                                ...prev,
                                selectedItemIndices: e.target.checked
                                  ? [...prev.selectedItemIndices, idx]
                                  : prev.selectedItemIndices.filter((i) => i !== idx)
                              }));
                            }}
                            className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-800 truncate">
                                #{idx + 1} {it.item_name}
                              </span>
                              {orderedOnPoRefs.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-mono text-[9.5px] font-bold">
                                  Ordered on {orderedOnPoRefs.join(', ')}
                                </span>
                              )}
                            </div>
                            <span className="text-[10.5px] text-slate-400 font-mono">
                              Qty: {it.quantity} {it.unit || 'pcs'}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono text-[11px] font-bold text-slate-700 shrink-0">
                          {poModalState.poVariant === 'supplier_po'
                            ? `Cost: ${unitCost.toFixed(2)}`
                            : `Rate: ${Number(it.unit_price || 0).toFixed(2)}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPoModalState((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmLaunchSupplierPo(false)}
                className="px-4 py-2 rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold cursor-pointer"
              >
                Save PO
              </button>
              <button
                type="button"
                onClick={() => handleConfirmLaunchSupplierPo(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Save &amp; Open in Studio</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Quotation Document View Modal (Inspection) */}
      {viewingQuotation && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden print:hidden">
          <div className="bg-slate-100 w-full max-w-[1000px] h-[92vh] rounded-2xl shadow-2xl flex flex-col border border-slate-300 overflow-hidden">
            <header className="px-5 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span className="font-mono font-bold text-sm text-slate-800">
                  {viewingQuotation.formatted_quote_ref}
                </span>
                {viewingQuotation.status === 'Sent' ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Sent
                  </span>
                ) : viewingQuotation.status === 'Superseded' ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500 border border-slate-200">
                    Superseded
                  </span>
                ) : viewingQuotation.status === 'Approved' ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Approved / Won
                  </span>
                ) : viewingQuotation.status === 'Declined' ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60 flex items-center gap-1 shadow-2xs">
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    Declined
                  </span>
                ) : (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    {viewingQuotation.status || 'Draft'}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {viewingQuotation.status === 'Sent' && (
                  <>
                    <button
                      type="button"
                      onClick={() => openDeclineModal(viewingQuotation)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                      title="Mark this quotation as Declined / Lost"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Decline / Lost</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => promptAcceptQuotation(viewingQuotation)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                      title="Mark this quotation as Client Accepted and confirm order"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Accept Quote / Won</span>
                    </button>
                  </>
                )}
                {((viewingQuotation.status === 'Sent' && !hasApprovedQuotation) || viewingQuotation.status === 'Approved') && (
                  <button
                    type="button"
                    onClick={() => handleCreateQuotationRevision(viewingQuotation)}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                    title="Fork this quote into a new revision draft (R1, R2...)"
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Create Revision</span>
                  </button>
                )}
                {viewingQuotation.status === 'Draft' && (
                  <button
                    type="button"
                    onClick={() => {
                      const toEdit = viewingQuotation;
                      setViewingQuotation(null);
                      setEditingQuotation(toEdit);
                      setIsQuotationStudioOpen(true);
                    }}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Draft</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (viewingQuotation) {
                      void handleOutsideQuickPrint(viewingQuotation);
                    } else {
                      window.print();
                    }
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print / Export</span>
                </button>
                <button
                  type="button"
                  onClick={() => promptDeleteQuotation(viewingQuotation)}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                  title={viewingQuotation.status === 'Draft' ? 'Discard Draft Quotation' : 'Delete to Recycle Bin'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{viewingQuotation.status === 'Draft' ? 'Discard' : 'Delete'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingQuotation(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
                  title="Close inspection modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-auto p-4 flex justify-center">
              <div className="w-full max-w-[210mm] shadow-xl">
                <QuotationDocument
                  quotation={viewingQuotation}
                  profile={documentProfile}
                  user={user}
                  enquiry={currentEnquiry}
                  salesRepName={currentEnquiry.assigned_salesperson || resolveSalespersonName(currentEnquiry)}
                  layoutBlocks={viewingQuotation.layout_blocks}
                  bankAccount={
                    viewingQuotation.selectedBank ||
                    viewingQuotation.selected_bank ||
                    viewingQuotation.applied_bank_account ||
                    documentProfile?.bank_accounts?.find(
                      (b) =>
                        b.id === (viewingQuotation.remittanceBankId || viewingQuotation.remittance_bank_id) ||
                        b.is_default
                    ) ||
                    documentProfile?.bank_accounts?.[0]
                  }
                  salespersons={salespersons}
                  signatoryName={viewingQuotation.primary_signatory_name}
                  signatoryTitle={viewingQuotation.primary_signatory_title}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Root-Level Print Portal for Saved Quotations */}
      {viewingQuotation && typeof document !== 'undefined' && createPortal(
        <div id="quotation-print-portal" className="hidden print:block">
          <QuotationDocument
            quotation={viewingQuotation}
            profile={documentProfile}
            isCompactView={(viewingQuotation as any).presentation_preset?.density === 'compact' || viewingQuotation.table_density === 'compact'}
            visibleColumns={(viewingQuotation as any).presentation_preset?.columns || viewingQuotation.visible_columns}
            layoutBlocks={viewingQuotation.layout_blocks}
            bankAccount={
              viewingQuotation.selectedBank ||
              viewingQuotation.selected_bank ||
              viewingQuotation.applied_bank_account ||
              documentProfile?.bank_accounts?.find(
                (b) =>
                  b.id === (viewingQuotation.remittanceBankId || viewingQuotation.remittance_bank_id) ||
                  b.is_default
              ) ||
              documentProfile?.bank_accounts?.[0]
            }
            salespersons={salespersons}
            salesRepName={currentEnquiry.assigned_salesperson || resolveSalespersonName(currentEnquiry)}
            user={user}
            signatoryName={viewingQuotation.primary_signatory_name}
            signatoryTitle={viewingQuotation.primary_signatory_title}
            showStampAndSignatures={true}
            showBankDetails={true}
            {...({
              enquiry: currentEnquiry,
              templatePreset: (viewingQuotation as any).presentation_preset?.theme || 'classic',
              isPrintMode: true,
              primarySignatoryName: viewingQuotation.primary_signatory_name,
              primarySignatoryTitle: viewingQuotation.primary_signatory_title
            } as any)}
          />
        </div>,
        document.body
      )}

      {/* Scoped Print Portal Styles for Saved Quotation View Modal */}
      {viewingQuotation && (
        <style>{`
          @media print {
            @page {
              size: A4 portrait;
              margin: 0 !important;
            }
            html, body {
              width: 210mm !important;
              margin: 0 !important;
              padding: 0 !important;
              gap: 0 !important;
              background: #ffffff !important;
            }
            body > *:not(#quotation-print-portal) {
              display: none !important;
            }
            #root {
              display: none !important;
            }
            #quotation-print-portal {
              display: block !important;
              position: static !important;
              width: 210mm !important;
              min-width: 210mm !important;
              max-width: 210mm !important;
              margin: 0 !important;
              padding: 0 !important;
              gap: 0 !important;
              border: none !important;
              background: #ffffff !important;
            }
            #quotation-print-portal .quotation-page-sheet {
              width: 210mm !important;
              height: 296.5mm !important;
              min-height: 296.5mm !important;
              max-height: 296.5mm !important;
              overflow: hidden !important;
              margin: 0 !important;
              border: none !important;
              box-shadow: none !important;
            }
            #quotation-print-portal .quotation-page-sheet:last-child,
            #quotation-print-portal .quotation-page-sheet:last-of-type,
            #quotation-print-portal .quotation-page-sheet.quotation-last-sheet {
              page-break-after: auto !important;
              break-after: auto !important;
            }
          }
        `}</style>
      )}

      {/* Decline Quotation / Mark as Lost Modal */}
      {declineModalState.isOpen && declineModalState.quotation && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-sans">
                    Decline Commercial Offer
                  </h3>
                  <p className="text-xs font-mono font-bold text-rose-600">
                    {declineModalState.quotation.formatted_quote_ref}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeclineModalState((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition cursor-pointer"
                disabled={declineModalState.isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 font-sans">
              Mark this quotation as declined by the client. This will set the parent enquiry to{' '}
              <strong className="text-slate-700">Lost / Cancelled</strong> and log the loss reason for tracking.
            </p>

            <div className="space-y-3 font-sans">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Loss Reason <span className="text-rose-500">*</span>
                </label>
                <select
                  value={declineModalState.reason}
                  onChange={(e) =>
                    setDeclineModalState((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 font-sans text-slate-800"
                >
                  <option value="Price / Competitor Cheaper">Price / Competitor Cheaper</option>
                  <option value="Delivery Lead Time Too Long">Delivery Lead Time Too Long</option>
                  <option value="Technical / Specification Mismatch">
                    Technical / Specification Mismatch
                  </option>
                  <option value="Project Cancelled / Postponed">Project Cancelled / Postponed</option>
                  <option value="Other / Unresponsive">Other / Unresponsive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Client Feedback / Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={declineModalState.notes}
                  onChange={(e) =>
                    setDeclineModalState((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Provide competitor details, client comments, or feedback..."
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 font-sans text-slate-800 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 font-sans">
              <button
                type="button"
                onClick={() => setDeclineModalState((prev) => ({ ...prev, isOpen: false }))}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer"
                disabled={declineModalState.isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDecline}
                disabled={declineModalState.isSubmitting}
                className="py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {declineModalState.isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Confirm Decline</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Company & Quick-Pair Modal */}
      <CreateCompanyModal
        isOpen={isCreateCompanyModalOpen}
        onClose={() => setIsCreateCompanyModalOpen(false)}
        activeWorkspace={activeWorkspace}
        user={user}
        companies={companies}
        setCompanies={setCompanies}
        initialName={unpairedCompanyName}
        initialCity={currentEnquiry.project_location || ''}
        initialCountry={currentEnquiry.country || 'UAE'}
        onCompanyCreated={handlePairCompany}
        onCompanyPaired={handlePairCompany}
        triggerToast={triggerToast}
      />

      {/* Save Custom Line Item to Products Catalog Modal */}
      <SaveToCatalogModal
        isOpen={saveToCatalogState.isOpen}
        onClose={() => setSaveToCatalogState({ isOpen: false, item: null, itemIndex: -1, isFromDraft: false })}
        lineItem={saveToCatalogState.item}
        currency={currentEnquiry.currency || 'AED'}
        activeWorkspaceId={currentEnquiry.workspace_id || activeWorkspaceId || activeWorkspace?.id}
        user={user}
        products={products}
        setProducts={setProducts}
        productCategories={(productCategories || []).map((c: any) => typeof c === 'string' ? c : c.name)}
        units={(units || []).map((u: any) => typeof u === 'string' ? u : u.name)}
        setProductCategories={setProductCategories as any}
        triggerToast={triggerToast}
        onProductSaved={async (newProduct) => {
          const idx = saveToCatalogState.itemIndex;
          if (idx < 0) return;
          if (saveToCatalogState.isFromDraft) {
            setDraftLineItems((prev) => {
              const next = [...prev];
              if (next[idx]) {
                next[idx] = {
                  ...next[idx],
                  product_id: newProduct.id,
                  sku: newProduct.sku || next[idx].sku,
                  item_name: newProduct.name || next[idx].item_name,
                  product_type: newProduct.product_type || next[idx].product_type,
                  description: newProduct.description || next[idx].description,
                  unit: newProduct.unit || next[idx].unit,
                  brand_make: newProduct.brand_make || next[idx].brand_make,
                  model_part_no: newProduct.model_part_no || next[idx].model_part_no,
                  country_of_origin: newProduct.country_of_origin || next[idx].country_of_origin,
                  hs_code: newProduct.hs_code || next[idx].hs_code,
                  lead_time_note: newProduct.default_availability || next[idx].lead_time_note,
                  image_url: newProduct.image_url || next[idx].image_url,
                  datasheet_attachment: newProduct.datasheet_attachment || next[idx].datasheet_attachment,
                  attributes:
                    newProduct.attributes && newProduct.attributes.length > 0
                      ? newProduct.attributes
                      : next[idx].attributes
                };
              }
              return next;
            });
          } else if (currentEnquiry.id && currentEnquiry.line_items) {
            const nextItems = [...currentEnquiry.line_items];
            if (nextItems[idx]) {
              nextItems[idx] = {
                ...nextItems[idx],
                product_id: newProduct.id,
                sku: newProduct.sku || nextItems[idx].sku,
                item_name: newProduct.name || nextItems[idx].item_name,
                product_type: newProduct.product_type || nextItems[idx].product_type,
                description: newProduct.description || nextItems[idx].description,
                unit: newProduct.unit || nextItems[idx].unit,
                brand_make: newProduct.brand_make || nextItems[idx].brand_make,
                model_part_no: newProduct.model_part_no || nextItems[idx].model_part_no,
                country_of_origin: newProduct.country_of_origin || nextItems[idx].country_of_origin,
                hs_code: newProduct.hs_code || nextItems[idx].hs_code,
                lead_time_note: newProduct.default_availability || nextItems[idx].lead_time_note,
                image_url: newProduct.image_url || nextItems[idx].image_url,
                secondary_image_url: newProduct.secondary_image_url || nextItems[idx].secondary_image_url,
                image_caption: newProduct.image_caption || nextItems[idx].image_caption,
                secondary_image_caption: newProduct.secondary_image_caption || nextItems[idx].secondary_image_caption,
                image_adjustments: newProduct.image_adjustments || nextItems[idx].image_adjustments,
                datasheet_attachment: newProduct.datasheet_attachment || nextItems[idx].datasheet_attachment,
                attributes:
                  newProduct.attributes && newProduct.attributes.length > 0
                    ? newProduct.attributes
                    : nextItems[idx].attributes
              };
                const updatedEnq = { ...currentEnquiry, line_items: nextItems, updatedAt: new Date().toISOString() };
                setCurrentEnquiry(updatedEnq);
                setDraftLineItems(nextItems);
                if (onUpdateEnquiry) onUpdateEnquiry(updatedEnq);
                if (setEnquiries) setEnquiries((prev) => prev.map((e) => (e.id === currentEnquiry.id ? updatedEnq : e)));
                try {
                  const strippedNextItems = stripCatalogRedundantLineItemMedia(nextItems, [newProduct, ...(products || [])]);
                  await safeUpdateDoc('enquiries', currentEnquiry.id, { line_items: strippedNextItems, updatedAt: updatedEnq.updatedAt });
                  await EnquiryRepository.save(updatedEnq);
                } catch (err) {
                  console.warn('Failed linking saved product back to enquiry line item:', err);
                }
              }
            }
          }}
        />

      {lightboxItemState && (
        <ImageLightboxModal
          isOpen={true}
          onClose={() => setLightboxItemState(null)}
          title={
            lightboxItemState.item.item_name ||
            lightboxItemState.item.description ||
            `Line Item #${lightboxItemState.origIdx + 1}`
          }
          imageUrl={
            lightboxItemState.item.image_url ||
            lightboxItemState.matchedProduct?.image_url ||
            ''
          }
          secondaryImageUrl={
            lightboxItemState.item.secondary_image_url ||
            lightboxItemState.matchedProduct?.secondary_image_url
          }
          caption={
            lightboxItemState.item.image_caption ??
            lightboxItemState.matchedProduct?.image_caption
          }
          secondaryCaption={
            lightboxItemState.item.secondary_image_caption ??
            lightboxItemState.matchedProduct?.secondary_image_caption
          }
          adjustments={
            lightboxItemState.item.image_adjustments ||
            lightboxItemState.matchedProduct?.image_adjustments
          }
          activeWorkspace={activeWorkspace}
          triggerToast={triggerToast}
          canEdit={canEditEnquiry(user, activeWorkspace, currentEnquiry)}
          onSaveChanges={async (updates) => {
            if (!currentEnquiry.id || !currentEnquiry.line_items) return;
            const targetIdx = lightboxItemState.origIdx;
            const nextItems = [...currentEnquiry.line_items];
            if (!nextItems[targetIdx]) return;
            nextItems[targetIdx] = {
              ...nextItems[targetIdx],
              ...updates
            };
            const updatedEnq = {
              ...currentEnquiry,
              line_items: nextItems,
              updatedAt: new Date().toISOString()
            };
            setCurrentEnquiry(updatedEnq);
            setDraftLineItems(nextItems);
            setLightboxItemState({
              ...lightboxItemState,
              item: nextItems[targetIdx]
            });
            if (onUpdateEnquiry) onUpdateEnquiry(updatedEnq);
            if (setEnquiries) {
              setEnquiries((prev) =>
                prev.map((e) => (e.id === currentEnquiry.id ? updatedEnq : e))
              );
            }
            await safeUpdateDoc('enquiries', currentEnquiry.id, {
              line_items: nextItems,
              updatedAt: updatedEnq.updatedAt
            });
            await EnquiryRepository.save(updatedEnq);
          }}
        />
      )}
    </div>
  );
}
