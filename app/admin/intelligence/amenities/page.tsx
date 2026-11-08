'use client';

import React, { useEffect, useState } from 'react';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import {
  Trees,
  Plus,
  Search,
  Filter,
  Edit3,
  Trash2,
  Dumbbell,
  Waves,
  Building,
  Shield,
  Zap,
  Wifi,
  Car,
  Gamepad2,
  Baby,
  Sun,
  Coffee,
  Sparkles,
  CheckCircle2,
  X,
  Loader2,
  AlertCircle,
  Layers,
} from 'lucide-react';

const APPROVED_CATEGORIES = [
  { id: 'ALL', label: 'All Categories' },
  { id: 'OUTDOOR', label: 'Outdoor & Nature' },
  { id: 'INDOOR', label: 'Indoor & Games' },
  { id: 'CLUBHOUSE', label: 'Clubhouse & Social' },
  { id: 'COMMUNITY', label: 'Community' },
  { id: 'FITNESS', label: 'Fitness & Sports' },
  { id: 'WELLNESS', label: 'Wellness & Spa' },
  { id: 'SECURITY', label: 'Security & Safety' },
  { id: 'ECO', label: 'Eco & Sustainability' },
  { id: 'GENERAL', label: 'General' },
];

const APPROVED_ICONS = [
  { id: 'dumbbell', label: 'Dumbbell / Fitness', icon: Dumbbell },
  { id: 'waves', label: 'Waves / Pool', icon: Waves },
  { id: 'building', label: 'Building / Clubhouse', icon: Building },
  { id: 'trees', label: 'Trees / Garden', icon: Trees },
  { id: 'shield', label: 'Shield / Security', icon: Shield },
  { id: 'zap', label: 'Zap / Power Backup', icon: Zap },
  { id: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { id: 'car', label: 'Car / Parking', icon: Car },
  { id: 'gamepad-2', label: 'Gamepad / Indoor', icon: Gamepad2 },
  { id: 'baby', label: 'Baby / Play Area', icon: Baby },
  { id: 'sun', label: 'Sun / Solar Eco', icon: Sun },
  { id: 'coffee', label: 'Coffee / Lounge', icon: Coffee },
  { id: 'sparkles', label: 'Sparkles / Concierge', icon: Sparkles },
  { id: 'check-circle2', label: 'Check Circle / Standard', icon: CheckCircle2 },
];

function renderAmenityIcon(iconName?: string | null, className = 'h-4 w-4') {
  if (!iconName) return <CheckCircle2 className={className} />;
  const found = APPROVED_ICONS.find((i) => i.id === iconName.toLowerCase());
  if (found) {
    const IconComp = found.icon;
    return <IconComp className={className} />;
  }
  return <CheckCircle2 className={className} />;
}

interface AmenityRecord {
  id: string;
  name: string;
  slug: string;
  category: string;
  icon?: string | null;
  associationCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export default function AdminAmenitiesPage() {
  const [amenities, setAmenities] = useState<AmenityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newCategory, setNewCategory] = useState('GENERAL');
  const [newIcon, setNewIcon] = useState('check-circle2');
  const [savingCreate, setSavingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Modal
  const [editingAmenity, setEditingAmenity] = useState<AmenityRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('GENERAL');
  const [editIcon, setEditIcon] = useState('check-circle2');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Dialog
  const [deletingAmenity, setDeletingAmenity] = useState<AmenityRecord | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchAmenities = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/amenities', {
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || errData.error || 'Failed to load amenities directory.');
      }
      const json = await res.json();
      setAmenities(json.data || []);
    } catch (err: any) {
      setError(err.message || 'Error loading amenities taxonomy');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAmenities();
  }, []);

  // Filtered List
  const filteredAmenities = amenities.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'ALL' ||
      item.category.toUpperCase() === selectedCategory.toUpperCase();
    return matchesSearch && matchesCategory;
  });

  // Handle Create Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setSavingCreate(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/admin/amenities', {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newName,
          slug: newSlug || undefined,
          category: newCategory,
          icon: newIcon,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create master amenity.');
      }

      setIsCreateOpen(false);
      setNewName('');
      setNewSlug('');
      setNewCategory('GENERAL');
      setNewIcon('check-circle2');
      fetchAmenities();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setSavingCreate(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (record: AmenityRecord) => {
    setEditingAmenity(record);
    setEditName(record.name);
    setEditCategory(record.category || 'GENERAL');
    setEditIcon(record.icon || 'check-circle2');
    setEditError(null);
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAmenity || !editName.trim()) return;

    setSavingEdit(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/admin/amenities/${editingAmenity.id}`, {
        method: 'PATCH',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editName,
          category: editCategory,
          icon: editIcon,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update amenity.');
      }

      setEditingAmenity(null);
      fetchAmenities();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Delete Confirmation
  const handleDeleteConfirm = async () => {
    if (!deletingAmenity) return;

    setDeletingLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/admin/amenities/${deletingAmenity.id}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete amenity.');
      }

      setDeletingAmenity(null);
      fetchAmenities();
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeletingLoading(false);
    }
  };

  if (loading) {
    return <AdminLoadingState message="Loading standardized master amenities taxonomy..." />;
  }

  if (error) {
    return (
      <AdminErrorState
        title="Failed to load Amenities Directory"
        error={error}
        onRetry={fetchAmenities}
      />
    );
  }

  return (
    <div className="space-y-6 pb-16 font-body">
      <AdminPageHeader
        title="Amenities Directory"
        description="Standardized master taxonomy for outdoor, indoor, clubhouse, fitness, security, and eco amenities."
        breadcrumbs={[
          { label: 'Project Intelligence', href: '/admin/intelligence/configurations' },
          { label: 'Amenities' },
        ]}
        primaryAction={{
          label: 'Add Master Amenity',
          onClick: () => {
            setCreateError(null);
            setIsCreateOpen(true);
          },
          icon: <Plus className="h-4 w-4" />,
        }}
      />

      <div className="px-6 space-y-6">
        {/* Search and Filters Bar */}
        <div className="bg-white border border-neutral-200/80 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
          {/* Search Input */}
          <div className="relative grow max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search master amenities by name or slug..."
              className="w-full text-sm pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:bg-white focus:border-indigo-500 focus:outline-hidden transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <Filter className="h-4 w-4 text-neutral-400 shrink-0" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs font-semibold bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-neutral-700 focus:outline-hidden transition font-display"
            >
              {APPROVED_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Directory List / Table */}
        <div className="bg-white border border-neutral-200/80 rounded-xl overflow-hidden shadow-2xs">
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
            <div className="flex items-center gap-2">
              <Trees className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-neutral-800 font-display">
                Master Taxonomy Registry
              </h3>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-neutral-100 text-neutral-700 rounded-full font-mono border border-neutral-200">
              {filteredAmenities.length} Records Shown ({amenities.length} Total)
            </span>
          </div>

          {filteredAmenities.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Trees className="h-10 w-10 text-neutral-300 mx-auto" />
              <p className="text-sm font-bold text-neutral-700 font-display">
                No matching master amenities found
              </p>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                {searchQuery || selectedCategory !== 'ALL'
                  ? 'Try clearing search filters or selecting a different amenity category.'
                  : 'Get started by creating your first standardized master amenity taxonomy.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200/80 text-[11px] font-bold text-neutral-400 uppercase tracking-wider font-display bg-neutral-50/60">
                    <th className="py-3 px-6 w-12 text-center">Icon</th>
                    <th className="py-3 px-4">Amenity Name</th>
                    <th className="py-3 px-4">Canonical Key / Slug</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Project Links</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredAmenities.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-neutral-50/60 transition-colors"
                    >
                      <td className="py-4 px-6 text-center">
                        <div className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                          {renderAmenityIcon(item.icon, 'h-4 w-4')}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-bold text-neutral-900 font-display">
                        {item.name}
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-neutral-500">
                        {item.slug}
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-neutral-100 text-neutral-700 border border-neutral-200/80 font-mono">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono">
                          <Layers className="h-3 w-3" />
                          {item.associationCount || 0} Project(s)
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="Edit Master Amenity"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteError(null);
                              setDeletingAmenity(item);
                            }}
                            className="p-1.5 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Master Amenity"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* CREATE MODAL DIALOG */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-neutral-200 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Trees className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-bold text-neutral-900 font-display">
                  Add Master Amenity
                </h3>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createError && (
              <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1 font-display">
                  Amenity Name *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (!newSlug) {
                      setNewSlug(
                        e.target.value
                          .toLowerCase()
                          .trim()
                          .replace(/[^a-z0-9]+/g, '-')
                      );
                    }
                  }}
                  placeholder="e.g. Temperature-Controlled Swimming Pool"
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1 font-display">
                  Canonical Key / Slug
                </label>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="e.g. heated-swimming-pool"
                  className="w-full text-sm font-mono bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition"
                />
                <span className="text-[11px] text-neutral-400 mt-0.5 block">
                  Unique identifier used in API responses and project associations.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1 font-display">
                    Category *
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition font-display"
                  >
                    {APPROVED_CATEGORIES.filter((c) => c.id !== 'ALL').map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1 font-display">
                    Icon Identifier
                  </label>
                  <select
                    value={newIcon}
                    onChange={(e) => setNewIcon(e.target.value)}
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition font-display"
                  >
                    {APPROVED_ICONS.map((ic) => (
                      <option key={ic.id} value={ic.id}>
                        {ic.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Icon Preview */}
              <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200/80">
                <span className="text-xs text-neutral-500 font-medium">Selected Icon Preview:</span>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-white border border-neutral-200 rounded-md text-indigo-600 font-bold text-xs font-mono">
                  {renderAmenityIcon(newIcon, 'h-4 w-4')}
                  <span>{newIcon}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-100 rounded-lg transition font-display"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCreate || !newName.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition font-display"
                >
                  {savingCreate ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Amenity'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL DIALOG */}
      {editingAmenity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-neutral-200 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-bold text-neutral-900 font-display">
                  Edit Master Amenity
                </h3>
              </div>
              <button
                onClick={() => setEditingAmenity(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editError && (
              <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1 font-display">
                  Amenity Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1 font-display">
                  Canonical Slug (Preserved)
                </label>
                <input
                  type="text"
                  value={editingAmenity.slug}
                  disabled
                  className="w-full text-sm font-mono bg-neutral-100 text-neutral-500 border border-neutral-200 rounded-lg p-2.5 cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1 font-display">
                    Category *
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition font-display"
                  >
                    {APPROVED_CATEGORIES.filter((c) => c.id !== 'ALL').map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1 font-display">
                    Icon Identifier
                  </label>
                  <select
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value)}
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition font-display"
                  >
                    {APPROVED_ICONS.map((ic) => (
                      <option key={ic.id} value={ic.id}>
                        {ic.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Icon Preview */}
              <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200/80">
                <span className="text-xs text-neutral-500 font-medium">Selected Icon Preview:</span>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-white border border-neutral-200 rounded-md text-indigo-600 font-bold text-xs font-mono">
                  {renderAmenityIcon(editIcon, 'h-4 w-4')}
                  <span>{editIcon}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditingAmenity(null)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-100 rounded-lg transition font-display"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editName.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition font-display"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Amenity'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deletingAmenity && (
        <AdminConfirmDialog
          isOpen={Boolean(deletingAmenity)}
          title={`Delete "${deletingAmenity.name}"?`}
          message={
            deletingAmenity.associationCount && deletingAmenity.associationCount > 0
              ? `Cannot delete this amenity because it is currently associated with ${deletingAmenity.associationCount} project(s). Remove project associations first.`
              : `Are you sure you want to permanently delete "${deletingAmenity.name}" from the master taxonomy? This operation cannot be undone.`
          }
          confirmLabel={
            deletingAmenity.associationCount && deletingAmenity.associationCount > 0
              ? 'Blocked'
              : 'Delete Permanently'
          }
          isDestructive={true}
          onConfirm={
            deletingAmenity.associationCount && deletingAmenity.associationCount > 0
              ? () => setDeletingAmenity(null)
              : handleDeleteConfirm
          }
          onCancel={() => {
            setDeletingAmenity(null);
            setDeleteError(null);
          }}
          isLoading={deletingLoading}
        />
      )}
    </div>
  );
}
