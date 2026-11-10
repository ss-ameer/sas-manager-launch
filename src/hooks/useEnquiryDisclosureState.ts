import { useState, useCallback } from 'react';

export type EnquiryDisclosureSectionKey =
  | 'locationScope'
  | 'customSpecs'
  | 'pipelineDates'
  | 'remarksTerms'
  | 'sourceFiles';

export type LineItemPanelKey = 'included' | 'scope' | 'specs' | 'media' | 'cost';

export interface LineItemPanelState {
  included?: boolean;
  scope?: boolean;
  specs?: boolean;
  media?: boolean;
  cost?: boolean;
}

export function useEnquiryDisclosureState(initialEditing?: boolean) {
  const [isMetadataExpanded, setIsMetadataExpanded] = useState<boolean>(false);

  const [expandedSections, setExpandedSections] = useState<Record<EnquiryDisclosureSectionKey, boolean>>({
    locationScope: false,
    customSpecs: false,
    pipelineDates: false,
    remarksTerms: false,
    sourceFiles: false,
  });

  const [expandedLinePanels, setExpandedLinePanels] = useState<Record<number, LineItemPanelState>>({});

  const toggleSection = useCallback((key: EnquiryDisclosureSectionKey) => {
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const setSectionOpen = useCallback((key: EnquiryDisclosureSectionKey, isOpen: boolean) => {
    setExpandedSections((prev) => (prev[key] === isOpen ? prev : { ...prev, [key]: isOpen }));
  }, []);

  const toggleLinePanel = useCallback((index: number, panel: LineItemPanelKey) => {
    setExpandedLinePanels((prev) => {
      const current = prev[index] || {};
      return {
        ...prev,
        [index]: {
          ...current,
          [panel]: !current[panel],
        },
      };
    });
  }, []);

  const setLinePanelExpanded = useCallback((index: number, panel: LineItemPanelKey, isOpen: boolean) => {
    setExpandedLinePanels((prev) => {
      const current = prev[index] || {};
      if (current[panel] === isOpen) return prev;
      return {
        ...prev,
        [index]: {
          ...current,
          [panel]: isOpen,
        },
      };
    });
  }, []);

  const expandAllLinePanelsForIndex = useCallback((index: number, open: boolean) => {
    setExpandedLinePanels((prev) => ({
      ...prev,
      [index]: {
        included: open,
        scope: open,
        specs: open,
        media: open,
        cost: open,
      },
    }));
  }, []);

  /**
   * Automatically opens any collapsed progressive-disclosure container when a user or AI extraction
   * jumps to a specific field ID.
   */
  const ensureFieldVisible = useCallback((fieldKey: string) => {
    if (fieldKey === 'received_date' || fieldKey === 'quote_ref_no' || fieldKey === 'country' || fieldKey === 'location') {
      setIsMetadataExpanded(true);
      setExpandedSections((prev) => ({ ...prev, locationScope: true }));
    } else if (fieldKey === 'custom_project_details') {
      setExpandedSections((prev) => ({ ...prev, customSpecs: true }));
    } else if (fieldKey === 'source_files') {
      setExpandedSections((prev) => ({ ...prev, sourceFiles: true }));
    }
  }, []);

  return {
    isMetadataExpanded,
    setIsMetadataExpanded,
    expandedSections,
    toggleSection,
    setSectionOpen,
    setSectionExpanded: setSectionOpen,
    expandedLinePanels,
    toggleLinePanel,
    setLinePanelExpanded,
    expandAllLinePanelsForIndex,
    ensureFieldVisible,
    isEditingExisting: Boolean(initialEditing),
  };
}
