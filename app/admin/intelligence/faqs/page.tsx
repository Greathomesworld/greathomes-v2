'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { AdminEmptyState } from '@/src/components/admin/AdminEmptyState';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { AdminStatCard } from '@/src/components/admin/AdminStatCard';
import { AdminPagination } from '@/src/components/admin/AdminPagination';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import {
  HelpCircle,
  Plus,
  Search,
  Filter,
  Edit3,
  Trash2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Building2,
  MapPin,
  X,
  Save,
  Loader2,
  RefreshCw,
  AlertCircle,
  FileQuestion,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface FaqItem {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  developerName?: string | null;
  developerId?: string | null;
  locationName?: string | null;
  question: string;
  answer: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProjectOption {
  id: string;
  name: string;
  slug: string;
}

interface DeveloperOption {
  id: string;
  name: string;
  slug?: string;
}

interface FaqStats {
  totalCount: number;
  publishedCount: number;
  draftCount: number;
}

export default function AdminFaqsPage() {
  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [developers, setDevelopers] = useState<DeveloperOption[]>([]);
  const [stats, setStats] = useState<FaqStats>({
    totalCount: 0,
    publishedCount: 0,
    draftCount: 0,
  });

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);

  // Filters state
  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL'); // 'ALL' | 'PUBLISHED' | 'DRAFT'
  const [sort, setSort] = useState<string>('createdAt:desc');

  // Expanded answer previews
  const [expandedFaqIds, setExpandedFaqIds] = useState<Set<string>>(new Set());

  // Add FAQ Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addProjectId, setAddProjectId] = useState('');
  const [addQuestion, setAddQuestion] = useState('');
  const [addAnswer, setAddAnswer] = useState('');
  const [addSortOrder, setAddSortOrder] = useState('0');
  const [addIsPublished, setAddIsPublished] = useState(true);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit FAQ Modal state
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [editSortOrder, setEditSortOrder] = useState('0');
  const [editIsPublished, setEditIsPublished] = useState(true);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Dialog state
  const [deletingFaq, setDeletingFaq] = useState<FaqItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Coverage Analysis state
  const [activeHubTab, setActiveHubTab] = useState<'hub' | 'coverage'>('hub');
  const [coverageData, setCoverageData] = useState<any>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [coverageStatusFilter, setCoverageStatusFilter] = useState<string>('ALL');
  const [coverageSearch, setCoverageSearch] = useState<string>('');

  const fetchCoverage = useCallback(async () => {
    try {
      setCoverageLoading(true);
      setCoverageError(null);
      const res = await fetch('/api/admin/faqs?mode=coverage', {
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch FAQ coverage analysis');
      }
      const data = await res.json();
      setCoverageData(data);
    } catch (err: any) {
      setCoverageError(err.message);
    } finally {
      setCoverageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeHubTab === 'coverage') {
      fetchCoverage();
    }
  }, [activeHubTab, fetchCoverage]);

  const filteredCoverageProjects = useMemo(() => {
    if (!coverageData?.projects) return [];
    return coverageData.projects.filter((p: any) => {
      if (coverageStatusFilter !== 'ALL' && p.coverageStatus !== coverageStatusFilter) {
        return false;
      }
      if (coverageSearch.trim()) {
        const q = coverageSearch.toLowerCase();
        const matchesName = p.projectName.toLowerCase().includes(q);
        const matchesDev = p.developerName && p.developerName.toLowerCase().includes(q);
        if (!matchesName && !matchesDev) return false;
      }
      return true;
    });
  }, [coverageData, coverageStatusFilter, coverageSearch]);

  // Fetch FAQs from cross-project admin API
  const fetchFaqs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedProjectId !== 'ALL') params.set('projectId', selectedProjectId);
      if (selectedDeveloperId !== 'ALL') params.set('developerId', selectedDeveloperId);
      if (selectedStatus !== 'ALL') params.set('status', selectedStatus);
      if (search.trim()) params.set('query', search.trim());
      params.set('sort', sort);
      params.set('page', page.toString());
      params.set('limit', limit.toString());

      const res = await fetch(`/api/admin/faqs?${params.toString()}`, {
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || `Failed to fetch FAQs (${res.status})`);
      }

      const data = await res.json();
      setFaqs(data.items || []);
      setProjects(data.projects || []);
      setDevelopers(data.developers || []);
      if (data.stats) {
        setStats(data.stats);
      }
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages || 1);
        setTotalFiltered(data.pagination.total || 0);
      }
    } catch (err: any) {
      console.error('[Admin FAQs Hub] Fetch error:', err);
      setError(err.message || 'An error occurred while loading FAQs.');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, selectedDeveloperId, selectedStatus, search, sort, page, limit]);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  // Handle toggling answer expansion
  const toggleExpand = (id: string) => {
    setExpandedFaqIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Reset filters
  const handleResetFilters = () => {
    setSearch('');
    setSelectedProjectId('ALL');
    setSelectedDeveloperId('ALL');
    setSelectedStatus('ALL');
    setSort('createdAt:desc');
    setPage(1);
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedProjectId !== 'ALL' ||
    selectedDeveloperId !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    sort !== 'createdAt:desc';

  // Handle Add FAQ
  const handleOpenAddModal = (presetProjectId?: string) => {
    setAddProjectId(presetProjectId || (projects.length > 0 ? projects[0].id : ''));
    setAddQuestion('');
    setAddAnswer('');
    setAddSortOrder('0');
    setAddIsPublished(true);
    setAddError(null);
    setIsAddModalOpen(true);
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addProjectId) {
      setAddError('Please select a project.');
      return;
    }
    if (!addQuestion.trim()) {
      setAddError('Please provide a question.');
      return;
    }
    if (!addAnswer.trim()) {
      setAddError('Please provide an answer.');
      return;
    }

    try {
      setIsSubmittingAdd(true);
      setAddError(null);

      const res = await fetch('/api/admin/faqs', {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: addProjectId,
          question: addQuestion.trim(),
          answer: addAnswer.trim(),
          sortOrder: parseInt(addSortOrder, 10) || 0,
          isPublished: addIsPublished,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to create FAQ.');
      }

      setIsAddModalOpen(false);
      fetchFaqs();
    } catch (err: any) {
      setAddError(err.message || 'Failed to create FAQ.');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Handle Edit FAQ
  const handleOpenEditModal = (faq: FaqItem) => {
    setEditingFaq(faq);
    setEditQuestion(faq.question);
    setEditAnswer(faq.answer);
    setEditSortOrder(faq.sortOrder.toString());
    setEditIsPublished(faq.isPublished);
    setEditError(null);
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFaq) return;
    if (!editQuestion.trim()) {
      setEditError('Question cannot be empty.');
      return;
    }
    if (!editAnswer.trim()) {
      setEditError('Answer cannot be empty.');
      return;
    }

    try {
      setIsSubmittingEdit(true);
      setEditError(null);

      const res = await fetch(`/api/projects/${editingFaq.projectId}/faqs/${editingFaq.id}`, {
        method: 'PATCH',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: editQuestion.trim(),
          answer: editAnswer.trim(),
          sortOrder: parseInt(editSortOrder, 10) || 0,
          isPublished: editIsPublished,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update FAQ.');
      }

      setEditingFaq(null);
      fetchFaqs();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update FAQ.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Handle Delete FAQ
  const handleConfirmDelete = async () => {
    if (!deletingFaq) return;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/projects/${deletingFaq.projectId}/faqs/${deletingFaq.id}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to delete FAQ.');
      }

      setDeletingFaq(null);
      fetchFaqs();
    } catch (err: any) {
      alert(err.message || 'Failed to delete FAQ.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <AdminPageHeader
        title="Project FAQs Intelligence"
        description="Curate project-level frequently asked questions, buyer answers, possession timelines, and pricing disclosures across residential projects."
        breadcrumbs={[
          { label: 'Project Intelligence', href: '/admin/intelligence/configurations' },
          { label: 'Project FAQs' },
        ]}
        primaryAction={{
          label: 'Add Project FAQ',
          onClick: () => handleOpenAddModal(),
          icon: <Plus className="h-4 w-4" />,
        }}
      />

      <div className="px-4 sm:px-6 space-y-6">
        {/* Hub Tabs */}
        <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
          <button
            onClick={() => setActiveHubTab('hub')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors font-display cursor-pointer ${
              activeHubTab === 'hub'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            All FAQs Hub ({stats.totalCount})
          </button>
          <button
            onClick={() => setActiveHubTab('coverage')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors font-display cursor-pointer ${
              activeHubTab === 'coverage'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            FAQ Coverage & Gaps Analysis
          </button>
        </div>

        {activeHubTab === 'coverage' ? (
          <div className="space-y-6">
            {/* Coverage Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <AdminStatCard
                title="Total Published Projects"
                value={coverageData?.summary?.totalPublishedProjects || 0}
                subtext="Active projects evaluated"
                icon={<Building2 className="h-5 w-5 text-indigo-600" />}
              />
              <AdminStatCard
                title="Projects With FAQs"
                value={coverageData?.summary?.projectsWithFaqs || 0}
                subtext="Projects featuring published Q&As"
                badgeText="Covered"
                badgeVariant="success"
                icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              />
              <AdminStatCard
                title="Needing FAQ Attention"
                value={coverageData?.summary?.projectsNeedingAttention || 0}
                subtext="Missing topic gaps or < 5 FAQs"
                badgeText={coverageData?.summary?.projectsNeedingAttention > 0 ? 'Action Required' : 'All Good'}
                badgeVariant={coverageData?.summary?.projectsNeedingAttention > 0 ? 'amber' : 'success'}
                icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
              />
              <AdminStatCard
                title="Projects With No FAQs"
                value={coverageData?.summary?.projectsWithNoFaqs || 0}
                subtext="Zero published FAQs"
                badgeText={coverageData?.summary?.projectsWithNoFaqs > 0 ? 'High Priority' : 'None'}
                badgeVariant={coverageData?.summary?.projectsWithNoFaqs > 0 ? 'amber' : 'neutral'}
                icon={<FileQuestion className="h-5 w-5 text-rose-600" />}
              />
            </div>

            {/* Coverage Filters */}
            <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  value={coverageSearch}
                  onChange={(e) => setCoverageSearch(e.target.value)}
                  placeholder="Filter projects or developers..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-body"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <span className="text-xs text-neutral-500 font-medium">Coverage Status:</span>
                <select
                  value={coverageStatusFilter}
                  onChange={(e) => setCoverageStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg font-display font-medium text-neutral-700"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="NO_FAQS">No FAQs ({coverageData?.summary?.projectsWithNoFaqs || 0})</option>
                  <option value="NEEDS_ATTENTION">Needs Attention ({coverageData?.summary?.projectsNeedingAttention || 0})</option>
                  <option value="GOOD_COVERAGE">Good Coverage</option>
                </select>
                <button
                  onClick={fetchCoverage}
                  title="Refresh Coverage"
                  className="p-2 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors border border-neutral-200 cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Coverage Table */}
            {coverageLoading && !coverageData ? (
              <AdminLoadingState message="Analyzing project FAQ coverage and topic gaps..." />
            ) : coverageError ? (
              <AdminErrorState title="Unable to load coverage analysis" error={coverageError} onRetry={fetchCoverage} />
            ) : filteredCoverageProjects.length === 0 ? (
              <AdminEmptyState
                title="No projects match the selected coverage filters"
                description="Try resetting your search query or coverage status filter."
                icon={<Building2 className="h-8 w-8 text-neutral-400" />}
                actionLabel="Reset Filters"
                onAction={() => {
                  setCoverageSearch('');
                  setCoverageStatusFilter('ALL');
                }}
              />
            ) : (
              <div className="bg-white border border-neutral-200/80 rounded-xl shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-500 uppercase tracking-wider font-display font-semibold">
                      <tr>
                        <th className="py-3 px-4">Project / Developer</th>
                        <th className="py-3 px-4 text-center">Published FAQs</th>
                        <th className="py-3 px-4 text-center">Draft FAQs</th>
                        <th className="py-3 px-4 text-center">Coverage Status</th>
                        <th className="py-3 px-4">Missing Topics & Recommended Action</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 font-body text-neutral-700">
                      {filteredCoverageProjects.map((p: any) => (
                        <tr key={p.projectId} className="hover:bg-neutral-50/60 transition-colors">
                          <td className="py-3 px-4 align-top">
                            <div className="font-bold text-neutral-900 font-display text-sm">{p.projectName}</div>
                            {p.developerName && (
                              <div className="text-neutral-500 text-[11px] mt-0.5">{p.developerName}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 align-top text-center font-mono font-semibold text-emerald-700">
                            {p.publishedFaqCount}
                          </td>
                          <td className="py-3 px-4 align-top text-center font-mono text-neutral-500">
                            {p.draftFaqCount}
                          </td>
                          <td className="py-3 px-4 align-top text-center">
                            {p.coverageStatus === 'NO_FAQS' && (
                              <span className="inline-block px-2.5 py-1 bg-rose-50 text-rose-800 border border-rose-200/80 rounded-full font-display font-semibold text-[11px]">
                                No FAQs
                              </span>
                            )}
                            {p.coverageStatus === 'NEEDS_ATTENTION' && (
                              <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-full font-display font-semibold text-[11px]">
                                Needs Attention
                              </span>
                            )}
                            {p.coverageStatus === 'GOOD_COVERAGE' && (
                              <span className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-full font-display font-semibold text-[11px]">
                                Good Coverage
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div className="space-y-1">
                              <p className="font-semibold text-neutral-900">{p.recommendedAction}</p>
                              {p.missingTopics && p.missingTopics.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {p.missingTopics.map((topic: string) => (
                                    <span key={topic} className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px]">
                                      Missing: {topic}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top text-right">
                            <Link
                              href={`/admin/projects/${p.projectId}?tab=faqs`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg transition-colors font-display text-xs"
                            >
                              <span>Manage FAQs</span>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <AdminStatCard
                title="Total Curated FAQs"
                value={stats.totalCount}
                subtext="Authoritative project-linked Q&As"
                icon={<HelpCircle className="h-5 w-5 text-indigo-600" />}
              />
              <AdminStatCard
                title="Published FAQs"
                value={stats.publishedCount}
                subtext="Live on project pages & FAQPage JSON-LD"
                badgeText="Publicly Active"
                badgeVariant="success"
                icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              />
              <AdminStatCard
                title="Draft / Unpublished"
                value={stats.draftCount}
                subtext="Internal guidance & pending review"
                badgeText={stats.draftCount > 0 ? 'Pending Review' : 'Zero Drafts'}
                badgeVariant={stats.draftCount > 0 ? 'amber' : 'neutral'}
                icon={<Clock className="h-5 w-5 text-amber-600" />}
              />
            </div>

        {/* Filter & Search Bar */}
        <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-2xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search question, answer, or project..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-body"
              />
            </div>

            {/* Project filter */}
            <div>
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-display font-medium text-neutral-700"
              >
                <option value="ALL">All Projects ({projects.length})</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Developer filter */}
            <div>
              <select
                value={selectedDeveloperId}
                onChange={(e) => {
                  setSelectedDeveloperId(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-display font-medium text-neutral-700"
              >
                <option value="ALL">All Developers ({developers.length})</option>
                {developers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-display font-medium text-neutral-700"
              >
                <option value="ALL">All Statuses</option>
                <option value="PUBLISHED">Published Only</option>
                <option value="DRAFT">Draft Only</option>
              </select>
            </div>
          </div>

          {/* Secondary bar: Sort + Active filters count + Reset */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-neutral-100 text-xs">
            <div className="flex items-center gap-2 text-neutral-500">
              <Filter className="h-3.5 w-3.5 text-neutral-400" />
              <span>
                Showing <strong>{faqs.length}</strong> of <strong>{totalFiltered}</strong> matching FAQs
              </span>
              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="ml-2 text-indigo-600 hover:text-indigo-800 font-medium underline cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-neutral-400">Sort by:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="px-2 py-1 bg-neutral-50 border border-neutral-200 rounded text-xs text-neutral-700 font-display font-medium"
              >
                <option value="createdAt:desc">Newest First</option>
                <option value="createdAt:asc">Oldest First</option>
                <option value="sortOrder:asc">Display Order (Ascending)</option>
                <option value="question:asc">Question (A-Z)</option>
              </select>
              <button
                onClick={fetchFaqs}
                title="Refresh FAQs"
                className="p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content State */}
        {loading && faqs.length === 0 ? (
          <AdminLoadingState message="Loading project FAQs intelligence..." />
        ) : error ? (
          <AdminErrorState
            title="Unable to load project FAQs"
            error={error}
            onRetry={fetchFaqs}
          />
        ) : faqs.length === 0 ? (
          <AdminEmptyState
            title={hasActiveFilters ? 'No FAQs match your search criteria' : 'No Project FAQs Curated Yet'}
            description={
              hasActiveFilters
                ? 'Try adjusting your search query, project selection, or publication filters.'
                : 'Project FAQs inform buyers about possession schedules, legal approvals, sports academies, and maintenance fees.'
            }
            icon={<FileQuestion className="h-8 w-8 text-neutral-400" />}
            actionLabel={hasActiveFilters ? 'Clear All Filters' : 'Add First Project FAQ'}
            onAction={hasActiveFilters ? handleResetFilters : () => handleOpenAddModal()}
          />
        ) : (
          <div className="bg-white border border-neutral-200/80 rounded-xl shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-500 uppercase tracking-wider font-display font-semibold">
                  <tr>
                    <th scope="col" className="py-3 px-4 w-1/4">Project & Locality</th>
                    <th scope="col" className="py-3 px-4 w-5/12">Question & Answer Preview</th>
                    <th scope="col" className="py-3 px-4 text-center w-20">Order</th>
                    <th scope="col" className="py-3 px-4 text-center w-28">Status</th>
                    <th scope="col" className="py-3 px-4 text-right w-28">Updated</th>
                    <th scope="col" className="py-3 px-4 text-right w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-body">
                  {faqs.map((faq) => {
                    const isExpanded = expandedFaqIds.has(faq.id);
                    return (
                      <tr key={faq.id} className="hover:bg-neutral-50/60 transition-colors">
                        {/* Project Info */}
                        <td className="py-3 px-4 align-top">
                          <div className="space-y-1">
                            <Link
                              href={`/admin/projects/${faq.projectId}`}
                              className="font-display font-bold text-neutral-900 hover:text-indigo-600 transition-colors inline-flex items-center gap-1 group"
                            >
                              <span>{faq.projectName}</span>
                              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500" />
                            </Link>

                            <div className="flex flex-col gap-0.5 text-[11px] text-neutral-500">
                              {faq.developerName && (
                                <span className="inline-flex items-center gap-1 truncate">
                                  <Building2 className="h-3 w-3 text-neutral-400 shrink-0" />
                                  <span>{faq.developerName}</span>
                                </span>
                              )}
                              {faq.locationName && (
                                <span className="inline-flex items-center gap-1 truncate text-neutral-400">
                                  <MapPin className="h-3 w-3 text-neutral-400 shrink-0" />
                                  <span>{faq.locationName}</span>
                                </span>
                              )}
                            </div>

                            {faq.projectSlug && (
                              <div className="pt-0.5">
                                <Link
                                  href={`/projects/${faq.projectSlug}#faq`}
                                  target="_blank"
                                  className="text-[10px] text-neutral-400 hover:text-[var(--color-accent)] inline-flex items-center gap-0.5"
                                >
                                  <span>View live section</span>
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </Link>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Question & Answer */}
                        <td className="py-3 px-4 align-top">
                          <div className="space-y-1.5 max-w-xl">
                            <p className="font-display font-semibold text-neutral-900 text-xs sm:text-sm leading-snug">
                              Q. {faq.question}
                            </p>
                            <div className="text-neutral-600 leading-relaxed text-xs">
                              {isExpanded ? (
                                <p className="whitespace-pre-wrap">{faq.answer}</p>
                              ) : (
                                <p className="line-clamp-2">{faq.answer}</p>
                              )}
                            </div>
                            {faq.answer.length > 120 && (
                              <button
                                onClick={() => toggleExpand(faq.id)}
                                className="text-[11px] font-display font-medium text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-0.5 cursor-pointer pt-0.5"
                              >
                                {isExpanded ? (
                                  <>
                                    <span>Collapse</span>
                                    <ChevronUp className="h-3 w-3" />
                                  </>
                                ) : (
                                  <>
                                    <span>Read full answer</span>
                                    <ChevronDown className="h-3 w-3" />
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Display Order */}
                        <td className="py-3 px-4 align-top text-center">
                          <span className="inline-block px-2 py-0.5 bg-neutral-100 rounded text-neutral-700 font-mono font-medium text-xs">
                            #{faq.sortOrder}
                          </span>
                        </td>

                        {/* Publication Status */}
                        <td className="py-3 px-4 align-top text-center">
                          <AdminBadge variant={faq.isPublished ? 'PUBLISHED' : 'DRAFT'} />
                        </td>

                        {/* Last Updated */}
                        <td className="py-3 px-4 align-top text-right text-neutral-400 text-[11px]">
                          {faq.updatedAt ? new Date(faq.updatedAt).toLocaleDateString() : '—'}
                        </td>

                        {/* Action buttons */}
                        <td className="py-3 px-4 align-top text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEditModal(faq)}
                              title="Edit FAQ"
                              className="p-1.5 text-neutral-600 hover:text-indigo-600 hover:bg-neutral-100 rounded transition-colors"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingFaq(faq)}
                              title="Delete FAQ"
                              className="p-1.5 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-neutral-100">
                <AdminPagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={totalFiltered}
                  pageSize={limit}
                  onPageChange={(p) => setPage(p)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    )}
  </div>

      {/* Add FAQ Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <HelpCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-display font-bold text-neutral-900">Add Project FAQ</h3>
                  <p className="text-xs text-neutral-500">Curate authoritative guidance for property seekers.</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {addError && (
              <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitAdd} className="space-y-4 text-xs font-body">
              {/* Project Selection */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1 font-display">
                  Target Project *
                </label>
                <select
                  value={addProjectId}
                  onChange={(e) => setAddProjectId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-display"
                >
                  <option value="" disabled>Select a residential development...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Question */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1 font-display">
                  Question *
                </label>
                <input
                  type="text"
                  value={addQuestion}
                  onChange={(e) => setAddQuestion(e.target.value)}
                  placeholder="e.g. When is the verified possession date for Merlin Rise?"
                  required
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Answer */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1 font-display">
                  Answer *
                </label>
                <textarea
                  value={addAnswer}
                  onChange={(e) => setAddAnswer(e.target.value)}
                  placeholder="e.g. Phase 1 possession is scheduled for December 2027 in compliance with WBRERA guidelines..."
                  rows={4}
                  required
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                />
              </div>

              {/* Sort Order & Publication Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1 font-display">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={addSortOrder}
                    onChange={(e) => setAddSortOrder(e.target.value)}
                    min={0}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 font-mono text-xs focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">Lower numbers appear first.</p>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1 font-display">
                    Publication Status
                  </label>
                  <select
                    value={addIsPublished ? 'true' : 'false'}
                    onChange={(e) => setAddIsPublished(e.target.value === 'true')}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 font-display text-xs focus:outline-hidden"
                  >
                    <option value="true">Published (Public)</option>
                    <option value="false">Draft (Internal Only)</option>
                  </select>
                  <p className="text-[10px] text-neutral-400 mt-1">Only published FAQs render on the public site.</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmittingAdd}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors font-display"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition-colors font-display shadow-xs cursor-pointer"
                >
                  {isSubmittingAdd ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      <span>Create FAQ</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit FAQ Modal */}
      {editingFaq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-display font-bold text-neutral-900">Edit Project FAQ</h3>
                  <p className="text-xs text-neutral-500">
                    Project: <span className="font-semibold text-neutral-700">{editingFaq.projectName}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingFaq(null)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {editError && (
              <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitEdit} className="space-y-4 text-xs font-body">
              {/* Question */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1 font-display">
                  Question *
                </label>
                <input
                  type="text"
                  value={editQuestion}
                  onChange={(e) => setEditQuestion(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Answer */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1 font-display">
                  Answer *
                </label>
                <textarea
                  value={editAnswer}
                  onChange={(e) => setEditAnswer(e.target.value)}
                  rows={4}
                  required
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                />
              </div>

              {/* Sort Order & Publication Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1 font-display">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={editSortOrder}
                    onChange={(e) => setEditSortOrder(e.target.value)}
                    min={0}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 font-mono text-xs focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">Order in public accordion.</p>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1 font-display">
                    Publication Status
                  </label>
                  <select
                    value={editIsPublished ? 'true' : 'false'}
                    onChange={(e) => setEditIsPublished(e.target.value === 'true')}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 font-display text-xs focus:outline-hidden"
                  >
                    <option value="true">Published (Public)</option>
                    <option value="false">Draft (Internal Only)</option>
                  </select>
                  <p className="text-[10px] text-neutral-400 mt-1">Draft FAQs are hidden from public pages.</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditingFaq(null)}
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors font-display"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition-colors font-display shadow-xs cursor-pointer"
                >
                  {isSubmittingEdit ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AdminConfirmDialog
        isOpen={Boolean(deletingFaq)}
        title="Delete Project FAQ"
        message={
          deletingFaq
            ? `Are you sure you want to delete the FAQ "${deletingFaq.question}" for project "${deletingFaq.projectName}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Confirm and Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingFaq(null)}
        isLoading={isDeleting}
      />
    </div>
  );
}
