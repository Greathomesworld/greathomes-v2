'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Compass,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import {
  PublicProjectConfigurationDto,
  PublicProjectMediaDto,
} from '@/src/domain/projects/dto/projectDto';
import {
  prepareProjectConfigurations,
  ProjectConfigurationViewModel,
  OpenFloorPlansParams,
} from './typologies/typologyModel';
import { useProjectInteraction, FloorPlanViewerMode } from './ProjectInteractionContext';
import { useEnquiry } from '@/src/components/enquiry/EnquiryContext';

export interface ProjectFloorPlanViewerProps {
  configurations?: PublicProjectConfigurationDto[];
  mediaList?: PublicProjectMediaDto[];
  projectName: string;
  projectSlug?: string;
  locationName?: string;
  isOpen?: boolean;
  mode?: FloorPlanViewerMode;
  activeConfigurationId?: string | null;
  initialMediaId?: string;
  onClose?: () => void;
  onSelectConfiguration?: (configId: string) => void;
}

/**
 * ProjectFloorPlanViewer
 *
 * Canonical, single-source-of-truth Great Homes Floor Plan Viewer.
 * Shared across all projects and entry points (cards, hero, etc.).
 * Supports both Configuration mode and Project mode.
 * Phase 05F.5.C.3: Advanced bounded zoom, pan, wheel, pinch-to-zoom, reset, loading & error states.
 */
export function ProjectFloorPlanViewer({
  configurations = [],
  mediaList = [],
  projectName,
  projectSlug,
  locationName,
  isOpen: propIsOpen,
  mode: propMode,
  activeConfigurationId: propActiveConfigId,
  initialMediaId,
  onClose: propOnClose,
  onSelectConfiguration: propOnSelectConfiguration,
}: ProjectFloorPlanViewerProps) {
  const interaction = useProjectInteraction();

  // Determine single source of truth for open state, viewer mode, and active configuration ID
  const isControlled = propIsOpen !== undefined;
  const isOpen = isControlled ? propIsOpen : interaction.viewerOpen;
  const mode: FloorPlanViewerMode = isControlled
    ? (propMode ?? 'configuration')
    : interaction.viewerMode;
  const activeConfigId = isControlled
    ? (propActiveConfigId ?? null)
    : interaction.activeConfigId;

  const handleClose = useCallback(() => {
    if (propOnClose) {
      propOnClose();
    } else {
      interaction.closeViewer();
    }
  }, [propOnClose, interaction]);

  // Convert raw DTOs into clean view models
  const viewModels = useMemo(
    () => prepareProjectConfigurations(configurations, mediaList),
    [configurations, mediaList]
  );

  // Derived list of project configurations with at least one floor plan
  const projectFloorPlanConfigurations = useMemo(
    () => viewModels.filter((c) => c.hasFloorPlans && c.floorPlans.length > 0),
    [viewModels]
  );

  // Configuration selection handler (resets plan index and zoom/pan to initial)
  const handleSelectConfiguration = useCallback((configId: string) => {
    if (propOnSelectConfiguration) {
      propOnSelectConfiguration(configId);
    } else {
      interaction.selectConfiguration(configId);
    }
    setCurrentIndex(0);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setImageError(false);
    setImageLoading(true);
  }, [propOnSelectConfiguration, interaction]);

  // Resolve the active configuration
  const activeConfig = useMemo<ProjectConfigurationViewModel | null>(() => {
    if (!isOpen) return null;
    if (activeConfigId) {
      const matched = projectFloorPlanConfigurations.find((c) => c.id === activeConfigId);
      if (matched) return matched;
      const vmMatched = viewModels.find((c) => c.id === activeConfigId);
      if (vmMatched && vmMatched.hasFloorPlans) return vmMatched;
    }
    // Default: first configuration with real floor plans
    return projectFloorPlanConfigurations[0] || null;
  }, [isOpen, activeConfigId, projectFloorPlanConfigurations, viewModels]);

  const floorPlans = activeConfig?.floorPlans || [];
  const totalPlans = floorPlans.length;

  // Track active floor plan index, loading, and error states
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [imageLoading, setImageLoading] = useState<boolean>(true);
  const [imageError, setImageError] = useState<boolean>(false);

  // Zoom & Pan interaction state
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingState, setIsDraggingState] = useState<boolean>(false);

  // Interaction DOM refs
  const modalRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchStartDist = useRef<number>(0);
  const pinchStartScale = useRef<number>(1);

  // Synchronize active media index on open or configuration change
  useEffect(() => {
    if (!isOpen || !activeConfig) return;

    const targetMediaId = initialMediaId || interaction.initialMediaId;
    if (targetMediaId) {
      const foundIdx = floorPlans.findIndex((m) => m.id === targetMediaId);
      setCurrentIndex(foundIdx >= 0 ? foundIdx : 0);
    } else if (interaction.activePlanIndex > 0 && interaction.activePlanIndex < floorPlans.length) {
      setCurrentIndex(interaction.activePlanIndex);
    } else {
      setCurrentIndex(0);
    }
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setImageLoading(true);
    setImageError(false);
  }, [isOpen, activeConfig?.id, initialMediaId, interaction.initialMediaId, interaction.activePlanIndex, floorPlans]);

  // Bounded pan calculation: keeps the floor plan recoverable within viewport
  const clampPosition = useCallback((x: number, y: number, currentScale: number) => {
    if (currentScale <= 1) {
      return { x: 0, y: 0 };
    }
    const container = viewportRef.current;
    const img = imageRef.current;
    if (!container || !img) {
      return { x: 0, y: 0 };
    }
    const containerRect = container.getBoundingClientRect();
    const baseW = img.offsetWidth;
    const baseH = img.offsetHeight;

    if (baseW === 0 || baseH === 0) {
      return { x: 0, y: 0 };
    }

    const scaledW = baseW * currentScale;
    const scaledH = baseH * currentScale;

    // Generous pan boundary allowing inspection of all corners with comfortable padding
    const maxPanX = Math.max(0, (scaledW - containerRect.width) / 2 + 56);
    const maxPanY = Math.max(0, (scaledH - containerRect.height) / 2 + 56);

    const clampedX = Math.max(-maxPanX, Math.min(maxPanX, x));
    const clampedY = Math.max(-maxPanY, Math.min(maxPanY, y));

    return { x: clampedX, y: clampedY };
  }, []);

  // Zoom control handlers
  const handleZoomIn = useCallback(() => {
    setScale((prev) => {
      const next = Math.min(4, Math.round((prev + 0.5) * 10) / 10);
      setPosition((pos) => clampPosition(pos.x, pos.y, next));
      return next;
    });
  }, [clampPosition]);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => {
      const next = Math.max(1, Math.round((prev - 0.5) * 10) / 10);
      if (next <= 1) {
        setPosition({ x: 0, y: 0 });
      } else {
        setPosition((pos) => clampPosition(pos.x, pos.y, next));
      }
      return next;
    });
  }, [clampPosition]);

  const handleResetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Double-click / Double-tap toggle
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setScale((prev) => {
      if (prev > 1) {
        setPosition({ x: 0, y: 0 });
        return 1;
      } else {
        const next = 2.5;
        setPosition({ x: 0, y: 0 });
        return next;
      }
    });
  }, []);

  // Scoped Mouse Wheel Zoom on image stage
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? 0.25 : -0.25;

      setScale((prevScale) => {
        const nextScale = Math.min(4, Math.max(1, Math.round((prevScale + zoomFactor) * 100) / 100));
        if (nextScale <= 1) {
          setPosition({ x: 0, y: 0 });
        } else {
          setPosition((pos) => clampPosition(pos.x, pos.y, nextScale));
        }
        return nextScale;
      });
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [isOpen, clampPosition]);

  // Pointer drag and mobile pinch-to-zoom handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // safe fallback
    }

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1) {
      if (scale > 1) {
        isDragging.current = true;
        setIsDraggingState(true);
        dragStart.current = { x: e.clientX, y: e.clientY };
        posStart.current = { ...position };
      }
    } else if (activePointers.current.size === 2) {
      isDragging.current = false;
      setIsDraggingState(false);
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartDist.current = dist > 0 ? dist : 1;
      pinchStartScale.current = scale;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two-pointer pinch to zoom
    if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStartDist.current > 0) {
        const factor = dist / pinchStartDist.current;
        const targetScale = Math.min(4, Math.max(1, Math.round(pinchStartScale.current * factor * 100) / 100));
        setScale(targetScale);
        if (targetScale <= 1) {
          setPosition({ x: 0, y: 0 });
        } else {
          setPosition((prev) => clampPosition(prev.x, prev.y, targetScale));
        }
      }
      return;
    }

    // Single-pointer drag pan when scale > 1
    if (isDragging.current && scale > 1) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const targetX = posStart.current.x + dx;
      const targetY = posStart.current.y + dy;
      const clamped = clampPosition(targetX, targetY, scale);
      setPosition(clamped);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(e.pointerId);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // safe fallback
    }

    if (activePointers.current.size < 2) {
      pinchStartDist.current = 0;
    }

    if (activePointers.current.size === 1) {
      const remaining = Array.from(activePointers.current.values())[0];
      dragStart.current = { x: remaining.x, y: remaining.y };
      posStart.current = { ...position };
      if (scale > 1) {
        isDragging.current = true;
        setIsDraggingState(true);
      }
    } else if (activePointers.current.size === 0) {
      isDragging.current = false;
      setIsDraggingState(false);
    }
  };

  // Cursor state
  const getCursorClass = () => {
    if (imageError || imageLoading) return 'cursor-default';
    if (scale <= 1) return 'cursor-zoom-in';
    return isDraggingState ? 'cursor-grabbing' : 'cursor-grab';
  };

  // Focus management & accessibility restoration
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Trap focus within modal while open
  useEffect(() => {
    if (!isOpen) return;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const modal = modalRef.current;
      if (!modal) return;

      const focusable = modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleTabKey);
    return () => window.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Navigation handlers with automatic reset of zoom and position
  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = Math.max(0, prev - 1);
      if (next !== prev) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setImageLoading(true);
        setImageError(false);
      }
      return next;
    });
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = Math.min(totalPlans - 1, prev + 1);
      if (next !== prev) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setImageLoading(true);
        setImageError(false);
      }
      return next;
    });
  }, [totalPlans]);

  const handleSelectPlanIndex = useCallback((idx: number) => {
    setCurrentIndex(idx);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setImageLoading(true);
    setImageError(false);
  }, []);

  // Keyboard navigation & zoom shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if ((e.key === 'ArrowLeft' || e.key === 'Left') && totalPlans > 1) {
        e.preventDefault();
        handlePrev();
      } else if ((e.key === 'ArrowRight' || e.key === 'Right') && totalPlans > 1) {
        e.preventDefault();
        handleNext();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleResetView();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalPlans, handleClose, handlePrev, handleNext, handleZoomIn, handleZoomOut, handleResetView]);

  const { openEnquiry } = useEnquiry();

  // If viewer is closed or active configuration has no floor plans, do NOT render
  if (!isOpen || !activeConfig || totalPlans === 0) {
    return null;
  }

  const currentPlan = floorPlans[currentIndex] || floorPlans[0];

  const handleEnquireFromViewer = () => {
    handleClose();
    openEnquiry({
      contextType: 'PROJECT',
      projectSlug,
      projectName,
      locationName,
      configurationId: activeConfig.id,
      configuration: activeConfig.name,
      requestSiteVisit: false,
      title: `${activeConfig.name} at ${projectName}`,
      priceDisplay: activeConfig.startingPriceFormatted,
      subtitle: `${activeConfig.carpetAreaDisplay || 'Verified'} Carpet Area · Floor Plan Enquiry`,
    });
  };

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="floor-plan-viewer-title"
      aria-describedby="floor-plan-viewer-desc"
      onClick={handleClose}
      className="fixed inset-0 z-50 bg-[#0F0F0F]/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 md:p-6 select-none overflow-hidden"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* Top Header Bar */}
      <header
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl mx-auto flex flex-col gap-2.5 pb-3 border-b border-white/10 text-white shrink-0"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-4">
            <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#E85D3F] text-white font-display shrink-0">
              {mode === 'project' ? 'Project Plans' : activeConfig.typologyCategory}
            </span>
            <div className="min-w-0">
              <h2
                id="floor-plan-viewer-title"
                className="text-sm sm:text-base font-bold font-display text-white tracking-tight truncate"
              >
                {projectName} · {activeConfig.name}
              </h2>
              <p
                id="floor-plan-viewer-desc"
                className="text-xs text-white/60 font-body tabular-nums"
              >
                Floor Plan {currentIndex + 1} of {totalPlans}
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            aria-label="Close floor plan viewer"
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Project Mode Dynamic Configuration Selector */}
        {mode === 'project' && projectFloorPlanConfigurations.length > 1 && (
          <nav
            role="tablist"
            aria-label="Project configurations with floor plans"
            className="flex items-center gap-2 overflow-x-auto py-1 -mb-1 no-scrollbar select-none"
          >
            <span className="text-[11px] text-white/50 uppercase tracking-wider font-display font-medium shrink-0 hidden sm:inline-block mr-1">
              Configurations:
            </span>
            <div className="flex items-center gap-1.5 min-w-0">
              {projectFloorPlanConfigurations.map((config) => {
                const isSelected = config.id === activeConfig.id;
                return (
                  <button
                    key={config.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => handleSelectConfiguration(config.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium font-display transition-all shrink-0 cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-white text-[#111111] shadow-xs font-semibold'
                        : 'bg-white/10 hover:bg-white/20 text-white/80 hover:text-white'
                    }`}
                  >
                    <span>{config.name}</span>
                    <span
                      className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full leading-none font-body ${
                        isSelected
                          ? 'bg-black/10 text-black/90 font-semibold'
                          : 'bg-white/15 text-white/70'
                      }`}
                    >
                      {config.floorPlanCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {/* Main Floor Plan Stage */}
      <main
        onClick={(e) => e.stopPropagation()}
        className="relative flex-1 w-full max-w-6xl mx-auto flex items-center justify-center my-2 sm:my-3 min-h-0 overflow-hidden"
      >
        {/* Previous Button (if multiple plans) */}
        {totalPlans > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            aria-label="Previous floor plan"
            className="absolute left-1 sm:left-4 z-20 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-xs transition-all disabled:opacity-20 disabled:cursor-not-allowed focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white cursor-pointer shadow-lg"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}

        {/* Floor Plan Viewport Canvas */}
        <div
          ref={viewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          className={`relative max-h-[60vh] sm:max-h-[66vh] w-full h-full flex items-center justify-center p-2 touch-none select-none overflow-hidden ${getCursorClass()}`}
        >
          {/* Floating Zoom Controls Toolbar */}
          {!imageError && !imageLoading && (
            <div
              role="toolbar"
              aria-label="Floor plan zoom controls"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20 flex items-center gap-1 bg-[#111111]/85 backdrop-blur-md border border-white/15 rounded-full p-1 sm:p-1.5 shadow-2xl select-none"
            >
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={scale <= 1}
                aria-label="Zoom out"
                title="Zoom out (-)"
                className="p-1.5 rounded-full hover:bg-white/15 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <span
                aria-live="polite"
                className="text-[11px] sm:text-xs font-mono font-medium text-white/90 px-1 min-w-[38px] text-center tabular-nums"
              >
                {Math.round(scale * 100)}%
              </span>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={scale >= 4}
                aria-label="Zoom in"
                title="Zoom in (+)"
                className="p-1.5 rounded-full hover:bg-white/15 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <div className="w-px h-4 bg-white/20 mx-0.5" />

              <button
                type="button"
                onClick={handleResetView}
                disabled={scale === 1 && position.x === 0 && position.y === 0}
                aria-label="Reset zoom and position"
                title="Reset view (0)"
                className="px-2 py-1 rounded-full text-[11px] font-display font-medium text-white/80 hover:text-white hover:bg-white/15 transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </div>
          )}

          {/* Loading Skeleton Indicator */}
          {imageLoading && !imageError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/[0.03] rounded-2xl border border-white/5 animate-pulse z-10 pointer-events-none">
              <div className="w-8 h-8 rounded-full border-2 border-[#E85D3F] border-t-transparent animate-spin mb-3" />
              <p className="text-xs text-white/70 font-display">Loading architectural plan...</p>
            </div>
          )}

          {/* Factual Image Error State */}
          {imageError ? (
            <div className="flex flex-col items-center justify-center text-center p-8 bg-white/5 rounded-2xl border border-white/10 max-w-md space-y-3 z-10">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white/50">
                <Compass className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold font-display text-white">
                Floor plan image unavailable
              </h3>
              <p className="text-xs text-white/60 font-body">
                The verified CAD layout for this configuration is currently being updated.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-1.5 rounded-full text-xs font-display font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                >
                  Close Viewer
                </button>
                {totalPlans > 1 && (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-4 py-1.5 rounded-full text-xs font-display font-semibold bg-[#E85D3F] hover:bg-[#D44C2F] text-white transition-colors cursor-pointer"
                  >
                    Next Floor Plan
                  </button>
                )}
              </div>
            </div>
          ) : (
            <img
              ref={imageRef}
              key={currentPlan.url}
              src={currentPlan.url}
              alt={
                currentPlan.altText ||
                `${activeConfig.name} architectural floor plan ${currentIndex + 1}`
              }
              draggable={false}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                setImageError(true);
              }}
              style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0px) scale(${scale})`,
                transition: isDraggingState ? 'none' : 'transform 0.15s ease-out',
                willChange: 'transform',
              }}
              className={`max-h-[58vh] sm:max-h-[66vh] max-w-full object-contain rounded-lg shadow-2xl select-none pointer-events-none transition-opacity duration-200 ${
                imageLoading ? 'opacity-0' : 'opacity-100'
              }`}
            />
          )}
        </div>

        {/* Next Button (if multiple plans) */}
        {totalPlans > 1 && (
          <button
            type="button"
            onClick={handleNext}
            disabled={currentIndex === totalPlans - 1}
            aria-label="Next floor plan"
            className="absolute right-1 sm:right-4 z-20 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-xs transition-all disabled:opacity-20 disabled:cursor-not-allowed focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white cursor-pointer shadow-lg"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}
      </main>

      {/* Bottom Context Bar */}
      <footer
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-white/10 text-white/80 shrink-0"
      >
        {/* Left: Configuration Area & Pricing Context */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-body">
          {activeConfig.carpetAreaDisplay && (
            <span>
              Carpet:{' '}
              <strong className="text-white font-semibold">
                {activeConfig.carpetAreaDisplay}
              </strong>
            </span>
          )}

          {activeConfig.secondaryAreaDisplay && (
            <>
              <span className="text-white/30">·</span>
              <span>
                {activeConfig.secondaryAreaLabel}:{' '}
                <strong className="text-white font-semibold">
                  {activeConfig.secondaryAreaDisplay}
                </strong>
              </span>
            </>
          )}

          <span className="text-white/30">·</span>
          <span>
            From:{' '}
            <strong className="text-white font-semibold font-display">
              {activeConfig.startingPriceFormatted}
            </strong>
          </span>

          {activeConfig.hasRate && activeConfig.rateDisplay && (
            <>
              <span className="text-white/30">·</span>
              <span className="text-white/70 font-display">
                {activeConfig.rateDisplay}
              </span>
            </>
          )}
        </div>

        {/* Right: Dot Indicator & Action Button */}
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          {totalPlans > 1 && (
            <div
              role="tablist"
              aria-label="Floor plan selection"
              className="flex items-center gap-1.5"
            >
              {floorPlans.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  aria-selected={idx === currentIndex}
                  aria-label={`View floor plan ${idx + 1}`}
                  onClick={() => handleSelectPlanIndex(idx)}
                  className={`h-2 rounded-full transition-all cursor-pointer focus:outline-hidden focus-visible:ring-1 focus-visible:ring-white ${
                    idx === currentIndex
                      ? 'w-6 bg-[#E85D3F]'
                      : 'w-2 bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleEnquireFromViewer}
            className="px-3.5 py-1.5 rounded-lg bg-[#E85D3F] hover:bg-[#D44C2F] text-white text-xs font-semibold font-display flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white ml-auto sm:ml-0"
          >
            <span>Enquire</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </footer>
    </div>
  );
}

export type { OpenFloorPlansParams, FloorPlanViewerMode };


