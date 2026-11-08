'use client';

import React, { useState } from 'react';
import {
  Sparkles, Plus, Edit2, Eye, EyeOff, Trash2, ArrowUp, ArrowDown,
  AlertCircle, CheckCircle2, Info, ShieldCheck, Building2, Compass, Home,
  X, Save, Loader2, FileText
} from 'lucide-react';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { ProjectConsiderations } from '@/src/components/projects/ProjectConsiderations';

interface ProjectIntelligenceControlProps {
  projectId: string;
  project: any;
  onRefresh: () => void;
}

const FORBIDDEN_INVESTMENT_PATTERNS = [
  /guaranteed\s+appreciation/i,
  /guaranteed\s+returns?/i,
  /\broi\b/i,
  /investment\s+score/i,
  /best\s+investment/i,
  /highest\s+appreciation/i,
  /future\s+price\s+prediction/i,
  /guaranteed\s+rental/i,
  /guaranteed\s+resale/i,
  /market\s+prediction/i,
  /ai\s+score/i,
];

export function ProjectIntelligenceControl({ projectId, project, onRefresh }: ProjectIntelligenceControlProps) {
  const [activeSection, setActiveSection] = useState<'WHY_CONSIDER' | 'THINGS_TO_KEEP_IN_MIND'>('WHY_CONSIDER');
  
  // Modal states for Add/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  
  const [formSection, setFormSection] = useState<'WHY_CONSIDER' | 'THINGS_TO_KEEP_IN_MIND'>('WHY_CONSIDER');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsVisible, setFormIsVisible] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const considerations = project.considerations || [];

  const editorialWhy = considerations
    .filter((c: any) => c.section === 'WHY_CONSIDER')
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  const editorialThings = considerations
    .filter((c: any) => c.section === 'THINGS_TO_KEEP_IN_MIND')
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  // Open modal to add
  const handleOpenAdd = (section: 'WHY_CONSIDER' | 'THINGS_TO_KEEP_IN_MIND') => {
    setEditingItem(null);
    setFormSection(section);
    setFormTitle('');
    setFormDescription('');
    setFormIsVisible(true);
    setError(null);
    setIsModalOpen(true);
  };

  // Open modal to edit
  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setFormSection(item.section);
    setFormTitle(item.title);
    setFormDescription(item.description);
    setFormIsVisible(item.isVisible);
    setError(null);
    setIsModalOpen(true);
  };

  // Content safety validation
  const validateInput = (title: string, desc: string): string | null => {
    if (!title.trim()) return 'Title is required.';
    if (title.trim().length > 150) return 'Title must be 150 characters or less.';
    if (!desc.trim()) return 'Description is required.';
    if (desc.trim().length > 1000) return 'Description must be 1000 characters or less.';

    const combined = `${title} ${desc}`;
    for (const pattern of FORBIDDEN_INVESTMENT_PATTERNS) {
      if (pattern.test(combined)) {
        return 'Editorial safety rule: Financial/investment guarantees, ROI promises, or speculative market predictions are prohibited.';
      }
    }
    return null;
  };

  // Submit Add / Edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateInput(formTitle, formDescription);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingItem) {
        // PATCH
        const res = await fetch(`/api/projects/${projectId}/considerations/${editingItem.id}`, {
          method: 'PATCH',
          headers: {
            ...getAdminHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: formTitle,
            description: formDescription,
            isVisible: formIsVisible,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update consideration');
        }
      } else {
        // POST
        const currentItems = formSection === 'WHY_CONSIDER' ? editorialWhy : editorialThings;
        const res = await fetch(`/api/projects/${projectId}/considerations`, {
          method: 'POST',
          headers: {
            ...getAdminHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            section: formSection,
            title: formTitle,
            description: formDescription,
            isVisible: formIsVisible,
            sortOrder: currentItems.length,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create consideration');
        }
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Error saving consideration');
    } finally {
      setSaving(false);
    }
  };

  // Toggle visibility
  const handleToggleVisibility = async (item: any) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/considerations/${item.id}`, {
        method: 'PATCH',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isVisible: !item.isVisible,
        }),
      });
      if (!res.ok) throw new Error('Failed to toggle visibility');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Delete item
  const handleDelete = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this editorial point?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/considerations/${itemId}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete consideration');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Reorder items
  const handleMove = async (section: 'WHY_CONSIDER' | 'THINGS_TO_KEEP_IN_MIND', index: number, direction: 'up' | 'down') => {
    const list = section === 'WHY_CONSIDER' ? [...editorialWhy] : [...editorialThings];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    const orderedIds = list.map(item => item.id);

    try {
      const res = await fetch(`/api/projects/${projectId}/considerations/reorder`, {
        method: 'PATCH',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ section, orderedIds }),
      });
      if (!res.ok) throw new Error('Failed to reorder considerations');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Overview Banner */}
      <div className="bg-white border border-neutral-200/80 rounded-xl p-6 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-600 shrink-0" />
            <h3 className="text-base font-bold text-neutral-900 font-display">Project Intelligence Admin</h3>
          </div>
          <span className="text-xs font-semibold text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full border border-neutral-200">
            Factual Engine + Editorial Overrides
          </span>
        </div>
        <p className="text-xs text-neutral-600 leading-relaxed max-w-3xl">
          Great Homes automatically derives factual points from project facts (RERA, Developer, Location, Amenities, Pricing). 
          You can add human editorial points or adjust their visibility to refine the narrative presented on the public project page.
        </p>
      </div>

      {/* SECTION 1: Generated Intelligence Preview */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold text-sky-700 bg-sky-100 border border-sky-200 rounded font-mono uppercase">
                AUTOMATICALLY GENERATED FROM PROJECT FACTS
              </span>
              <h4 className="text-sm font-bold text-neutral-800 font-display">System Generated Intelligence</h4>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              These points are computed deterministically from verified project database records. They cannot be edited directly; update project core attributes to change them.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Why Consider Generated */}
          <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-2">
            <div className="font-bold text-neutral-900 flex items-center gap-1.5 font-display">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Why Consider {project.name} (Fact Engine)</span>
            </div>
            <ul className="space-y-2 text-neutral-700 list-disc pl-5 font-sans leading-relaxed">
              {project.rera?.hasVerifiedReraBadge && (
                <li><strong>Verified RERA Compliance:</strong> Registration {project.rera?.registrationNumber} ({project.rera?.authority || 'WBRERA'}).</li>
              )}
              {project.developer?.name && (
                <li><strong>Established Developer:</strong> Developed by {project.developer?.name}.</li>
              )}
              {project.location?.name && (
                <li><strong>Location & Connectivity:</strong> Positioned in {project.location?.name}.</li>
              )}
              {project.amenities?.length > 0 && (
                <li><strong>Verified Amenities:</strong> {project.amenities.length} documented amenities.</li>
              )}
              {project.configurations?.length > 0 && (
                <li><strong>Typology Flexibility:</strong> {project.configurations.length} residential layouts offered.</li>
              )}
            </ul>
          </div>

          {/* Things to Keep in Mind Generated */}
          <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-2">
            <div className="font-bold text-neutral-900 flex items-center gap-1.5 font-display">
              <Info className="h-4 w-4 text-amber-600 shrink-0" />
              <span>Things to Keep in Mind (Fact Engine)</span>
            </div>
            <ul className="space-y-2 text-neutral-700 list-disc pl-5 font-sans leading-relaxed">
              {project.status && (
                <li><strong>Construction Stage:</strong> Status is {project.status.replace(/_/g, ' ')}.</li>
              )}
              {project.pricing?.priceBasis && (
                <li><strong>Price Basis:</strong> Quoted on {project.pricing.priceBasis.replace(/_/g, ' ')} basis.</li>
              )}
              {project.pricing?.startingPrice && (
                <li><strong>Entry Price:</strong> Starting at ₹{(project.pricing.startingPrice / 100000).toFixed(2)} L onwards.</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* SECTION 2: Editorial Overrides Management */}
      <div className="space-y-6">
        {/* WHY CONSIDER BUYING Editorial Section */}
        <div className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 rounded font-mono uppercase">
                  EDITORIAL BY GREAT HOMES
                </span>
                <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider font-display">
                  Why Consider Buying — Editorial Overrides
                </h4>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Authored points appended to the "Why Consider" section.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenAdd('WHY_CONSIDER')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors font-display"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Why Consider Point
            </button>
          </div>

          {editorialWhy.length === 0 ? (
            <div className="p-6 text-center bg-neutral-50 rounded-lg border border-dashed border-neutral-200 text-xs text-neutral-500 font-sans">
              No editorial Why Consider points added yet. Generated points are displayed on the public project page.
            </div>
          ) : (
            <div className="space-y-3">
              {editorialWhy.map((item: any, idx: number) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all ${
                    item.isVisible ? 'bg-white border-neutral-200' : 'bg-neutral-50/80 border-neutral-200/60 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-neutral-900 font-display">{item.title}</span>
                        {!item.isVisible && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-neutral-200 text-neutral-600 rounded font-mono uppercase">
                            Hidden
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-600 leading-relaxed font-sans">{item.description}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMove('WHY_CONSIDER', idx, 'up')}
                        disabled={idx === 0}
                        title="Move Up"
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 rounded hover:bg-neutral-100"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove('WHY_CONSIDER', idx, 'down')}
                        disabled={idx === editorialWhy.length - 1}
                        title="Move Down"
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 rounded hover:bg-neutral-100"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(item)}
                        title={item.isVisible ? 'Hide Point' : 'Show Point'}
                        className={`p-1.5 rounded transition-colors ${
                          item.isVisible ? 'text-emerald-600 hover:bg-emerald-50' : 'text-neutral-400 hover:bg-neutral-100'
                        }`}
                      >
                        {item.isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        title="Edit Point"
                        className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        title="Delete Point"
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* THINGS TO KEEP IN MIND Editorial Section */}
        <div className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded font-mono uppercase">
                  EDITORIAL BY GREAT HOMES
                </span>
                <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider font-display">
                  Things to Keep in Mind — Editorial Overrides
                </h4>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Authored considerations appended to the "Things to Keep in Mind" section.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenAdd('THINGS_TO_KEEP_IN_MIND')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors font-display"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Keep in Mind Point
            </button>
          </div>

          {editorialThings.length === 0 ? (
            <div className="p-6 text-center bg-neutral-50 rounded-lg border border-dashed border-neutral-200 text-xs text-neutral-500 font-sans">
              No editorial Things to Keep in Mind points added yet. Generated points are displayed on the public project page.
            </div>
          ) : (
            <div className="space-y-3">
              {editorialThings.map((item: any, idx: number) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all ${
                    item.isVisible ? 'bg-white border-neutral-200' : 'bg-neutral-50/80 border-neutral-200/60 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-neutral-900 font-display">{item.title}</span>
                        {!item.isVisible && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-neutral-200 text-neutral-600 rounded font-mono uppercase">
                            Hidden
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-600 leading-relaxed font-sans">{item.description}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMove('THINGS_TO_KEEP_IN_MIND', idx, 'up')}
                        disabled={idx === 0}
                        title="Move Up"
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 rounded hover:bg-neutral-100"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove('THINGS_TO_KEEP_IN_MIND', idx, 'down')}
                        disabled={idx === editorialThings.length - 1}
                        title="Move Down"
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 rounded hover:bg-neutral-100"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(item)}
                        title={item.isVisible ? 'Hide Point' : 'Show Point'}
                        className={`p-1.5 rounded transition-colors ${
                          item.isVisible ? 'text-emerald-600 hover:bg-emerald-50' : 'text-neutral-400 hover:bg-neutral-100'
                        }`}
                      >
                        {item.isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        title="Edit Point"
                        className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        title="Delete Point"
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3: Live Public Project Intelligence Preview */}
      <div className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-sky-600 shrink-0" />
            <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider font-display">
              Final Public Project Intelligence Preview
            </h4>
          </div>
          <span className="text-xs font-semibold text-neutral-500">
            Real-time public portal view
          </span>
        </div>

        <div className="p-6 bg-neutral-50/50 rounded-xl border border-neutral-200/70">
          <ProjectConsiderations project={project} />
        </div>
      </div>

      {/* MODAL: Add / Edit Consideration */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white border border-neutral-200 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-xl font-sans">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold text-neutral-900 font-display">
                {editingItem ? 'Edit Editorial Point' : 'Add Editorial Point'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 mb-1">Target Section</label>
                <div className="px-3 py-2 bg-neutral-100 border border-neutral-200 rounded-lg text-neutral-800 font-semibold">
                  {formSection === 'WHY_CONSIDER' ? 'Why Consider Buying' : 'Things to Keep in Mind'}
                </div>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 mb-1">Title * (max 150 chars)</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Well-connected location or High green cover ratio"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  maxLength={150}
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 mb-1">Description * (max 1000 chars)</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. Located in Rajarhat with access to major arterial routes and commercial IT parks."
                  rows={4}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  maxLength={1000}
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isVisible"
                  checked={formIsVisible}
                  onChange={(e) => setFormIsVisible(e.target.checked)}
                  className="h-4 w-4 text-neutral-900 rounded border-neutral-300 focus:ring-neutral-900"
                />
                <label htmlFor="isVisible" className="font-semibold text-neutral-800 select-none">
                  Visible on Public Project Page
                </label>
              </div>

              <div className="text-[11px] text-neutral-500 bg-amber-50 border border-amber-200/80 p-3 rounded-lg leading-relaxed">
                <strong>Content Policy:</strong> Guaranteed returns, ROI figures, or investment promises are prohibited.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-bold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg font-display"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg font-display disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save Editorial Point'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
