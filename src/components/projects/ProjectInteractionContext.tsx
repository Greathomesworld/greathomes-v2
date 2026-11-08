'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { OpenFloorPlansParams } from './typologies/typologyModel';

export type FloorPlanViewerMode = 'configuration' | 'project';

interface ProjectInteractionContextType {
  viewerOpen: boolean;
  viewerMode: FloorPlanViewerMode;
  activeConfigId: string | null;
  activePlanIndex: number;
  initialMediaId?: string;
  openFloorPlans: (params: OpenFloorPlansParams) => void;
  openProjectViewer: () => void;
  openConfigurationViewer: (configId: string, initialIndex?: number, initialMediaId?: string) => void;
  selectConfiguration: (configId: string) => void;
  closeViewer: () => void;
  brochureModalOpen: boolean;
  openBrochureModal: () => void;
  closeBrochureModal: () => void;
}

const ProjectInteractionContext = createContext<ProjectInteractionContextType | undefined>(undefined);

export function ProjectInteractionProvider({ children }: { children: ReactNode }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerMode, setViewerMode] = useState<FloorPlanViewerMode>('configuration');
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [activePlanIndex, setActivePlanIndex] = useState(0);
  const [initialMediaId, setInitialMediaId] = useState<string | undefined>(undefined);
  const [brochureModalOpen, setBrochureModalOpen] = useState(false);

  const openFloorPlans = useCallback((params: OpenFloorPlansParams) => {
    setViewerMode(params.configurationId ? 'configuration' : 'project');
    setActiveConfigId(params.configurationId || null);
    setActivePlanIndex(0);
    setInitialMediaId(params.initialMediaId);
    setViewerOpen(true);
  }, []);

  const openProjectViewer = useCallback(() => {
    setViewerMode('project');
    setActiveConfigId(null);
    setActivePlanIndex(0);
    setInitialMediaId(undefined);
    setViewerOpen(true);
  }, []);

  const openConfigurationViewer = useCallback((configId: string, initialIndex = 0, mediaId?: string) => {
    setViewerMode('configuration');
    setActiveConfigId(configId);
    setActivePlanIndex(initialIndex);
    setInitialMediaId(mediaId);
    setViewerOpen(true);
  }, []);

  const selectConfiguration = useCallback((configId: string) => {
    setActiveConfigId(configId);
    setActivePlanIndex(0);
    setInitialMediaId(undefined);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    setActiveConfigId(null);
    setActivePlanIndex(0);
    setInitialMediaId(undefined);
  }, []);

  const openBrochureModal = useCallback(() => {
    setBrochureModalOpen(true);
  }, []);

  const closeBrochureModal = useCallback(() => {
    setBrochureModalOpen(false);
  }, []);

  return (
    <ProjectInteractionContext.Provider
      value={{
        viewerOpen,
        viewerMode,
        activeConfigId,
        activePlanIndex,
        initialMediaId,
        openFloorPlans,
        openProjectViewer,
        openConfigurationViewer,
        selectConfiguration,
        closeViewer,
        brochureModalOpen,
        openBrochureModal,
        closeBrochureModal,
      }}
    >
      {children}
    </ProjectInteractionContext.Provider>
  );
}

export function useProjectInteraction() {
  const context = useContext(ProjectInteractionContext);
  if (!context) {
    return {
      viewerOpen: false,
      viewerMode: 'configuration' as FloorPlanViewerMode,
      activeConfigId: null,
      activePlanIndex: 0,
      initialMediaId: undefined,
      openFloorPlans: () => {},
      openProjectViewer: () => {},
      openConfigurationViewer: () => {},
      selectConfiguration: () => {},
      closeViewer: () => {},
      brochureModalOpen: false,
      openBrochureModal: () => {},
      closeBrochureModal: () => {},
    };
  }
  return context;
}

