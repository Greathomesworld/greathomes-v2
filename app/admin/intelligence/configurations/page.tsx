'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { AdminEmptyState } from '@/src/components/admin/AdminEmptyState';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { compareEffectiveRates, comparePricesWithPorLast } from '@/src/lib/priceUtils';
import {
  Plus,
  Search,
  Filter,
  Sliders,
  Layers,
  Edit3,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
  Building2,
  MapPin,
  ExternalLink,
  Check,
  TrendingUp,
  FileSpreadsheet,
  AlertTriangle,
} from 'lucide-react';

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  status?: string;
  priceOnRequest?: boolean;
}

interface ConfigurationItem {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  developerName?: string | null;
  locationName?: string | null;
  name: string;
  bedroomCount?: number | null;
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
  price: number;
  priceOnRequest?: boolean;
  priceBasis: 'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA';
  effectivePricePerSqft: number;
  floorPlanMediaId?: string | null;
  floorPlanCount: number;
  hasFloorPlan: boolean;
  availability: string;
  createdAt: string;
  updatedAt: string;
}

export default function AdminConfigurationsDirectoryPage() {
  const [configurations, setConfigurations] = useState<ConfigurationItem[]>([]);
  const [projectsList, setProjectsList] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [selectedBhk, setSelectedBhk] = useState<string>('ALL');
  const [selectedPriceBasis, setSelectedPriceBasis] = useState<string>('ALL');
  const [selectedFloorPlanFilter, setSelectedFloorPlanFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('createdAt:desc');

  // Success Notification Banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Create Configuration Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createProjectId, setCreateProjectId] = useState<string>('');
  const [createName, setCreateName] = useState('');
  const [createBhk, setCreateBhk] = useState('');
  const [createPrice, setCreatePrice] = useState('');
  const [createPriceOnRequest, setCreatePriceOnRequest] = useState(false);
  const [createPriceBasis, setCreatePriceBasis] = useState<'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA'>('CARPET_AREA');
  const [createCarpetArea, setCreateCarpetArea] = useState('');
  const [createBuiltUpArea, setCreateBuiltUpArea] = useState('');
  const [createSuperBuiltUpArea, setCreateSuperBuiltUpArea] = useState('');
  const [createAvailability, setCreateAvailability] = useState('AVAILABLE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchConfigurations = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/configurations', {
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Failed to load configurations directory');
      }
      const result = await res.json();
      setConfigurations(result.data || []);
      setProjectsList(result.projects || []);
      if (result.projects && result.projects.length > 0 && !createProjectId) {
        setCreateProjectId(result.projects[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigurations();
  }, []);

  // Filtered and Sorted Configurations
  const filteredConfigurations = useMemo(() => {
    let result = [...configurations];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.projectName.toLowerCase().includes(q) ||
          c.developerName?.toLowerCase().includes(q) ||
          c.locationName?.toLowerCase().includes(q)
      );
    }

    if (selectedProjectId !== 'ALL') {
      result = result.filter((c) => c.projectId === selectedProjectId);
    }

    if (selectedBhk !== 'ALL') {
      const bhkNum = parseInt(selectedBhk, 10);
      result = result.filter((c) => c.bedroomCount === bhkNum);
    }

    if (selectedPriceBasis !== 'ALL') {
      result = result.filter((c) => c.priceBasis === selectedPriceBasis);
    }

    if (selectedFloorPlanFilter !== 'ALL') {
      const wantFP = selectedFloorPlanFilter === 'WITH_FP';
      result = result.filter((c) => c.hasFloorPlan === wantFP);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'name:asc':
          return a.name.localeCompare(b.name);
        case 'price:asc':
          return comparePricesWithPorLast(a.priceOnRequest ? null : a.price, b.priceOnRequest ? null : b.price, 'asc');
        case 'price:desc':
          return comparePricesWithPorLast(a.priceOnRequest ? null : a.price, b.priceOnRequest ? null : b.price, 'desc');
        case 'effectiveRate:asc':
          return compareEffectiveRates(a.priceOnRequest ? null : a.effectivePricePerSqft, b.priceOnRequest ? null : b.effectivePricePerSqft, 'asc');
        case 'effectiveRate:desc':
          return compareEffectiveRates(a.priceOnRequest ? null : a.effectivePricePerSqft, b.priceOnRequest ? null : b.effectivePricePerSqft, 'desc');
        case 'createdAt:asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'createdAt:desc':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [
    configurations,
    searchQuery,
    selectedProjectId,
    selectedBhk,
    selectedPriceBasis,
    selectedFloorPlanFilter,
    sortBy,
  ]);

  // Key Summary Stats
  const summaryStats = useMemo(() => {
    const totalCount = configurations.length;
    const withFP = configurations.filter((c) => c.hasFloorPlan).length;
    const fpPercentage = totalCount > 0 ? Math.round((withFP / totalCount) * 100) : 0;

    const rates = configurations
      .map((c) => c.effectivePricePerSqft)
      .filter((r) => typeof r === 'number' && r > 0);
    const avgRate = rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;

    const uniqueProjectsCount = new Set(configurations.map((c) => c.projectId)).size;

    return {
      totalCount,
      withFP,
      fpPercentage,
      avgRate,
      uniqueProjectsCount,
    };
  }, [configurations]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedProjectId !== 'ALL' ||
    selectedBhk !== 'ALL' ||
    selectedPriceBasis !== 'ALL' ||
    selectedFloorPlanFilter !== 'ALL';

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedProjectId('ALL');
    setSelectedBhk('ALL');
    setSelectedPriceBasis('ALL');
    setSelectedFloorPlanFilter('ALL');
    setSortBy('createdAt:desc');
  };

  // Live Effective Rate Preview for Create Modal
  const liveEffectiveRate = useMemo(() => {
    const p = parseFloat(createPrice);
    if (!p || p <= 0) return null;

    let area: number | null = null;
    if (createPriceBasis === 'CARPET_AREA') {
      area = parseFloat(createCarpetArea);
    } else if (createPriceBasis === 'BUILT_UP_AREA') {
      area = parseFloat(createBuiltUpArea);
    } else if (createPriceBasis === 'SUPER_BUILT_UP_AREA') {
      area = parseFloat(createSuperBuiltUpArea);
    }

    if (!area || area <= 0) return null;
    return Math.round(p / area);
  }, [createPrice, createPriceBasis, createCarpetArea, createBuiltUpArea, createSuperBuiltUpArea]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createProjectId) {
      setCreateError('Please select a project');
      return;
    }
    if (!createName.trim()) {
      setCreateError('Configuration name is required');
      return;
    }
    const parsedPrice = createPrice.trim() !== '' ? parseFloat(createPrice) : (createPriceOnRequest ? 0 : NaN);
    if (isNaN(parsedPrice) || (!createPriceOnRequest && parsedPrice <= 0) || parsedPrice < 0) {
      setCreateError('Price must be a positive number unless Price on Request is enabled');
      return;
    }

    if (createPriceBasis === 'CARPET_AREA' && (!createCarpetArea || parseFloat(createCarpetArea) <= 0)) {
      setCreateError('Carpet area is required for CARPET_AREA price basis');
      return;
    }
    if (createPriceBasis === 'BUILT_UP_AREA' && (!createBuiltUpArea || parseFloat(createBuiltUpArea) <= 0)) {
      setCreateError('Built-up area is required for BUILT_UP_AREA price basis');
      return;
    }
    if (createPriceBasis === 'SUPER_BUILT_UP_AREA' && (!createSuperBuiltUpArea || parseFloat(createSuperBuiltUpArea) <= 0)) {
      setCreateError('Super built-up area is required for SUPER_BUILT_UP_AREA price basis');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        name: createName.trim(),
        bedroomCount: createBhk ? parseInt(createBhk, 10) : null,
        price: parsedPrice,
        priceOnRequest: createPriceOnRequest,
        priceBasis: createPriceBasis,
        carpetArea: createCarpetArea ? parseFloat(createCarpetArea) : null,
        builtUpArea: createBuiltUpArea ? parseFloat(createBuiltUpArea) : null,
        superBuiltUpArea: createSuperBuiltUpArea ? parseFloat(createSuperBuiltUpArea) : null,
        availability: createAvailability,
      };

      const res = await fetch(`/api/projects/${createProjectId}/configurations`, {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create configuration');
      }

      const created = await res.json();
      setIsCreateModalOpen(false);

      // Reset form
      setCreateName('');
      setCreateBhk('');
      setCreatePrice('');
      setCreatePriceOnRequest(false);
      setCreateCarpetArea('');
      setCreateBuiltUpArea('');
      setCreateSuperBuiltUpArea('');

      setToastMessage(`Configuration '${created.name || createName}' created successfully.`);
      setTimeout(() => setToastMessage(null), 5000);

      // Refresh list
      fetchConfigurations();
    } catch (err: any) {
      setCreateError(err.message || 'Error creating configuration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatPriceInr = (price: number) => {
    if (!price || isNaN(price)) return '₹0';
    if (price >= 10000000) {
      return `₹${(price / 10000000).toFixed(2)} Cr`;
    }
    if (price >= 100000) {
      return `₹${(price / 100000).toFixed(2)} Lakh`;
    }
    return `₹${price.toLocaleString('en-IN')}`;
  };

  const formatRateInr = (rate: number) => {
    if (!rate || isNaN(rate)) return 'N/A';
    return `₹${rate.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title="Project Configurations & Floor Plans"
        description="Master intelligence directory for unit layouts, bedroom counts, carpet area metrics, effective pricing, and floor plan attachments across all projects."
        breadcrumbs={[
          { label: 'Project Intelligence', href: '/admin/intelligence/configurations' },
          { label: 'Configurations Directory' },
        ]}
        primaryAction={{
          label: 'Create Configuration',
          onClick: () => {
            if (projectsList.length > 0 && !createProjectId) {
              setCreateProjectId(projectsList[0].id);
            }
            setIsCreateModalOpen(true);
          },
          icon: <Plus className="h-4 w-4" />,
        }}
      />

      {/* Success Notification Banner */}
      {toastMessage && (
        <div className="mx-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-display font-medium">{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="px-6 space-y-6">
        {loading ? (
          <AdminLoadingState message="Loading global configurations directory..." />
        ) : error ? (
          <AdminErrorState
            title="Failed to Load Configurations Directory"
            error={error}
            onRetry={fetchConfigurations}
          />
        ) : (
          <>
            {/* Key Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-white border border-neutral-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-medium text-neutral-500 uppercase tracking-wider">
                    Total Configurations
                  </p>
                  <p className="text-2xl font-display font-bold text-neutral-900 mt-1">
                    {summaryStats.totalCount}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">Across {summaryStats.uniqueProjectsCount} projects</p>
                </div>
                <div className="p-3 rounded-xl bg-neutral-100 text-neutral-700">
                  <Sliders className="h-6 w-6" />
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-neutral-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-medium text-neutral-500 uppercase tracking-wider">
                    Avg Effective Price
                  </p>
                  <p className="text-2xl font-display font-bold text-neutral-900 mt-1">
                    {formatRateInr(summaryStats.avgRate)}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">Per sq.ft across directory</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-neutral-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-medium text-neutral-500 uppercase tracking-wider">
                    Floor Plan Coverage
                  </p>
                  <p className="text-2xl font-display font-bold text-neutral-900 mt-1">
                    {summaryStats.fpPercentage}%
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {summaryStats.withFP} of {summaryStats.totalCount} configs attached
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
                  <ImageIcon className="h-6 w-6" />
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-neutral-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-medium text-neutral-500 uppercase tracking-wider">
                    Projects Covered
                  </p>
                  <p className="text-2xl font-display font-bold text-neutral-900 mt-1">
                    {summaryStats.uniqueProjectsCount}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">With active typologies</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                  <Building2 className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="p-4 rounded-2xl bg-white border border-neutral-200/80 shadow-xs space-y-4">
              <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search configuration name, project, developer or location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 text-sm font-body text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Refresh button */}
                <button
                  onClick={fetchConfigurations}
                  className="px-3 py-2.5 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 text-sm font-display font-medium flex items-center justify-center space-x-2 transition-all shrink-0"
                  title="Reload Directory Data"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Refresh</span>
                </button>
              </div>

              {/* Filter Controls Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2 border-t border-neutral-100">
                {/* Project Filter */}
                <div>
                  <label className="block text-xs font-display font-medium text-neutral-500 mb-1">
                    Project
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-xs font-body text-neutral-800 bg-neutral-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-neutral-400"
                  >
                    <option value="ALL">All Projects ({projectsList.length})</option>
                    {projectsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* BHK Filter */}
                <div>
                  <label className="block text-xs font-display font-medium text-neutral-500 mb-1">
                    BHK Type
                  </label>
                  <select
                    value={selectedBhk}
                    onChange={(e) => setSelectedBhk(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-xs font-body text-neutral-800 bg-neutral-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-neutral-400"
                  >
                    <option value="ALL">All BHK Types</option>
                    <option value="1">1 BHK</option>
                    <option value="2">2 BHK</option>
                    <option value="3">3 BHK</option>
                    <option value="4">4 BHK</option>
                    <option value="5">5+ BHK</option>
                  </select>
                </div>

                {/* Price Basis Filter */}
                <div>
                  <label className="block text-xs font-display font-medium text-neutral-500 mb-1">
                    Price Basis
                  </label>
                  <select
                    value={selectedPriceBasis}
                    onChange={(e) => setSelectedPriceBasis(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-xs font-body text-neutral-800 bg-neutral-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-neutral-400"
                  >
                    <option value="ALL">All Price Bases</option>
                    <option value="CARPET_AREA">Carpet Area</option>
                    <option value="BUILT_UP_AREA">Built-Up Area</option>
                    <option value="SUPER_BUILT_UP_AREA">Super Built-Up Area</option>
                  </select>
                </div>

                {/* Floor Plan Filter */}
                <div>
                  <label className="block text-xs font-display font-medium text-neutral-500 mb-1">
                    Floor Plan
                  </label>
                  <select
                    value={selectedFloorPlanFilter}
                    onChange={(e) => setSelectedFloorPlanFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-xs font-body text-neutral-800 bg-neutral-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-neutral-400"
                  >
                    <option value="ALL">All Floor Plan Status</option>
                    <option value="WITH_FP">Attached Floor Plan</option>
                    <option value="NO_FP">Missing Floor Plan</option>
                  </select>
                </div>

                {/* Sort By */}
                <div>
                  <label className="block text-xs font-display font-medium text-neutral-500 mb-1">
                    Sort By
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-xs font-body text-neutral-800 bg-neutral-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-neutral-400"
                  >
                    <option value="createdAt:desc">Newest Added</option>
                    <option value="createdAt:asc">Oldest Added</option>
                    <option value="price:asc">Price: Low to High</option>
                    <option value="price:desc">Price: High to Low</option>
                    <option value="effectiveRate:asc">Rate: Low to High</option>
                    <option value="effectiveRate:desc">Rate: High to Low</option>
                    <option value="name:asc">Name: A to Z</option>
                  </select>
                </div>
              </div>

              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <div className="flex items-center justify-between pt-2 border-t border-neutral-100 text-xs text-neutral-500">
                  <span>
                    Showing {filteredConfigurations.length} of {configurations.length} configurations
                  </span>
                  <button
                    onClick={clearFilters}
                    className="text-neutral-900 hover:underline font-display font-medium flex items-center space-x-1"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear All Filters</span>
                  </button>
                </div>
              )}
            </div>

            {/* Configurations Data Table */}
            {filteredConfigurations.length === 0 ? (
              <AdminEmptyState
                title="No Configurations Found"
                description={
                  hasActiveFilters
                    ? "No project configurations match your selected filter criteria. Try clearing or broadening your search filters."
                    : "No project configurations are currently registered in PostgreSQL."
                }
                icon={<Sliders className="h-8 w-8 text-neutral-400" />}
                actionLabel={hasActiveFilters ? "Clear Filters" : "Create Configuration"}
                onAction={
                  hasActiveFilters
                    ? clearFilters
                    : () => setIsCreateModalOpen(true)
                }
              />
            ) : (
              <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-200/80 bg-neutral-50/80 text-xs font-display font-medium text-neutral-500 tracking-wider">
                        <th className="py-3.5 px-4 font-medium">Project</th>
                        <th className="py-3.5 px-4 font-medium">Configuration Name</th>
                        <th className="py-3.5 px-4 font-medium">BHK</th>
                        <th className="py-3.5 px-4 font-medium">Areas (sq.ft)</th>
                        <th className="py-3.5 px-4 font-medium">Price Basis</th>
                        <th className="py-3.5 px-4 font-medium">Total Price</th>
                        <th className="py-3.5 px-4 font-medium">Effective Rate</th>
                        <th className="py-3.5 px-4 font-medium">Floor Plan</th>
                        <th className="py-3.5 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200/60 text-sm font-body text-neutral-800">
                      {filteredConfigurations.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-neutral-50/60 transition-colors group"
                        >
                          {/* Project Column */}
                          <td className="py-3.5 px-4">
                            <Link
                              href={`/admin/projects/${item.projectId}`}
                              className="font-display font-medium text-neutral-900 hover:text-black hover:underline flex items-center space-x-1.5 group/link"
                            >
                              <span className="truncate max-w-[180px]">{item.projectName}</span>
                              <ExternalLink className="h-3 w-3 text-neutral-400 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                            </Link>
                            <div className="text-xs text-neutral-500 flex items-center space-x-2 mt-0.5">
                              {item.developerName && (
                                <span className="truncate max-w-[120px]">{item.developerName}</span>
                              )}
                              {item.developerName && item.locationName && <span>•</span>}
                              {item.locationName && (
                                <span className="truncate max-w-[120px]">{item.locationName}</span>
                              )}
                            </div>
                          </td>

                          {/* Name Column */}
                          <td className="py-3.5 px-4">
                            <span className="font-display font-semibold text-neutral-900">
                              {item.name}
                            </span>
                          </td>

                          {/* BHK Column */}
                          <td className="py-3.5 px-4">
                            {item.bedroomCount ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-display font-medium bg-neutral-100 text-neutral-800">
                                {item.bedroomCount} BHK
                              </span>
                            ) : (
                              <span className="text-neutral-400 text-xs">—</span>
                            )}
                          </td>

                          {/* Areas Column */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5 text-xs">
                              {item.carpetArea ? (
                                <div
                                  className={
                                    item.priceBasis === 'CARPET_AREA'
                                      ? 'font-medium text-neutral-900'
                                      : 'text-neutral-600'
                                  }
                                >
                                  <span className="text-neutral-400">Carpet:</span>{' '}
                                  {item.carpetArea.toLocaleString('en-IN')} sq.ft
                                </div>
                              ) : null}
                              {item.builtUpArea ? (
                                <div
                                  className={
                                    item.priceBasis === 'BUILT_UP_AREA'
                                      ? 'font-medium text-neutral-900'
                                      : 'text-neutral-500'
                                  }
                                >
                                  <span className="text-neutral-400">Built-up:</span>{' '}
                                  {item.builtUpArea.toLocaleString('en-IN')} sq.ft
                                </div>
                              ) : null}
                              {item.superBuiltUpArea ? (
                                <div
                                  className={
                                    item.priceBasis === 'SUPER_BUILT_UP_AREA'
                                      ? 'font-medium text-neutral-900'
                                      : 'text-neutral-500'
                                  }
                                >
                                  <span className="text-neutral-400">Super:</span>{' '}
                                  {item.superBuiltUpArea.toLocaleString('en-IN')} sq.ft
                                </div>
                              ) : null}
                              {!item.carpetArea && !item.builtUpArea && !item.superBuiltUpArea && (
                                <span className="text-neutral-400">—</span>
                              )}
                            </div>
                          </td>

                          {/* Price Basis Column */}
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-display font-medium bg-neutral-100 text-neutral-700 border border-neutral-200/60 uppercase">
                              {item.priceBasis.replace(/_/g, ' ')}
                            </span>
                          </td>

                          {/* Total Price Column */}
                          <td className="py-3.5 px-4 font-display font-semibold text-neutral-900">
                            <div>
                              {item.price && item.price > 0 ? formatPriceInr(item.price) : '—'}
                            </div>
                            {item.priceOnRequest && (
                              <span className="inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 font-display">
                                Price on Request
                              </span>
                            )}
                          </td>

                          {/* Effective Rate Column */}
                          <td className="py-3.5 px-4">
                            <div className="font-display font-medium text-neutral-900">
                              {formatRateInr(item.effectivePricePerSqft)}
                            </div>
                            <div className="text-[10px] text-neutral-400 uppercase">
                              per {item.priceBasis.toLowerCase().replace(/_/g, ' ')}
                            </div>
                          </td>

                          {/* Floor Plan Status Column */}
                          <td className="py-3.5 px-4">
                            {item.hasFloorPlan ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-display font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Attached ({item.floorPlanCount})</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-display font-medium bg-amber-50 text-amber-700 border border-amber-200/80">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                <span>No Floor Plan</span>
                              </span>
                            )}
                          </td>

                          {/* Actions Column */}
                          <td className="py-3.5 px-4 text-right space-x-2 shrink-0">
                            <Link
                              href={`/admin/projects/${item.projectId}?tab=configs`}
                              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-100 text-xs font-display font-medium transition-all"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-neutral-500" />
                              <span>Manage / Floor Plans</span>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Configuration Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-neutral-200 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center space-x-2">
                <Sliders className="h-5 w-5 text-neutral-700" />
                <h3 className="text-lg font-display font-bold text-neutral-900">
                  Create Project Configuration
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-body flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Target Project Selection */}
              <div>
                <label className="block text-xs font-display font-medium text-neutral-700 mb-1">
                  Target Project <span className="text-red-500">*</span>
                </label>
                <select
                  value={createProjectId}
                  onChange={(e) => setCreateProjectId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm font-body text-neutral-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400"
                >
                  <option value="" disabled>
                    Select Project
                  </option>
                  {projectsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Configuration Name and BHK */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-display font-medium text-neutral-700 mb-1">
                    Configuration Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2 BHK Classic or 3 BHK Grande"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm font-body text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-display font-medium text-neutral-700 mb-1">
                    Bedroom Count (BHK)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 2"
                    min="0"
                    max="20"
                    value={createBhk}
                    onChange={(e) => setCreateBhk(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm font-body text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
              </div>

              {/* Price and Price Basis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-display font-medium text-neutral-700 mb-1">
                    {createPriceOnRequest ? 'Internal Price (₹, Optional)' : 'Total Configuration Price (₹)'}{' '}
                    {!createPriceOnRequest && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="number"
                    placeholder={createPriceOnRequest ? 'Optional internal reference price' : 'e.g. 4800000'}
                    min="0"
                    value={createPrice}
                    onChange={(e) => setCreatePrice(e.target.value)}
                    required={!createPriceOnRequest}
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm font-body text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10"
                  />
                  {createPrice && !isNaN(parseFloat(createPrice)) && parseFloat(createPrice) > 0 && (
                    <span className="text-[11px] text-neutral-500 mt-0.5 block font-display">
                      Formatted: {formatPriceInr(parseFloat(createPrice))}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-display font-medium text-neutral-700 mb-1">
                    Price Basis <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createPriceBasis}
                    onChange={(e: any) => setCreatePriceBasis(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm font-body text-neutral-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10"
                  >
                    <option value="CARPET_AREA">Carpet Area</option>
                    <option value="BUILT_UP_AREA">Built-Up Area</option>
                    <option value="SUPER_BUILT_UP_AREA">Super Built-Up Area</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createPriceOnRequest}
                    onChange={(e) => setCreatePriceOnRequest(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                  />
                  <div>
                    <span className="text-xs font-display font-bold text-neutral-900 block">
                      Mark Configuration as Price on Request
                    </span>
                    <span className="text-[11px] font-body text-neutral-500 block">
                      Hides the configuration price from public pages while keeping any internal price for staff.
                    </span>
                  </div>
                </label>
              </div>

              {/* Area Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-display font-medium text-neutral-700 mb-1">
                    Carpet Area (sq.ft){' '}
                    {createPriceBasis === 'CARPET_AREA' && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 640"
                    min="1"
                    value={createCarpetArea}
                    onChange={(e) => setCreateCarpetArea(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm font-body text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-display font-medium text-neutral-700 mb-1">
                    Built-Up Area (sq.ft){' '}
                    {createPriceBasis === 'BUILT_UP_AREA' && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 780"
                    min="1"
                    value={createBuiltUpArea}
                    onChange={(e) => setCreateBuiltUpArea(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm font-body text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-display font-medium text-neutral-700 mb-1">
                    Super Built-Up (sq.ft){' '}
                    {createPriceBasis === 'SUPER_BUILT_UP_AREA' && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 950"
                    min="1"
                    value={createSuperBuiltUpArea}
                    onChange={(e) => setCreateSuperBuiltUpArea(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm font-body text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
              </div>

              {/* Real-time Effective Rate Preview Box */}
              {liveEffectiveRate !== null && (
                <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between text-xs">
                  <span className="font-display font-medium text-neutral-600">
                    Calculated Effective Price:
                  </span>
                  <span className="font-display font-bold text-neutral-900 text-sm">
                    {formatRateInr(liveEffectiveRate)} / sq.ft ({createPriceBasis.toLowerCase().replace(/_/g, ' ')})
                  </span>
                </div>
              )}

              {/* Availability */}
              <div>
                <label className="block text-xs font-display font-medium text-neutral-700 mb-1">
                  Availability
                </label>
                <select
                  value={createAvailability}
                  onChange={(e) => setCreateAvailability(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm font-body text-neutral-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="FEW_UNITS_LEFT">Few Units Left</option>
                  <option value="SOLD_OUT">Sold Out</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-sm font-display font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-sm font-display font-medium shadow-xs transition-all disabled:opacity-50 flex items-center space-x-2"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      <span>Create Configuration</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
